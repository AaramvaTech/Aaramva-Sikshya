import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, useMemo } from 'react';

import {
  useMyChildren,
  useChildAttendanceSummary,
  useChildAttendanceHistory,
} from '../../hooks/useParentChild';
import { useAuthStore } from '../../store/auth';
import { STATUS_CONFIG } from '../../lib/attendance';
import type { AttendanceStatus } from '../../lib/attendance';
import { todayBs, daysInBsMonth, bsToAd, BS_MONTH_NAMES_EN } from 'bs-calendar';
import type { BsDate } from 'bs-calendar';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 64) / 7);
const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function prevMonthOf(curr: BsDate): BsDate {
  if (curr.month === 1) return { year: curr.year - 1, month: 12, day: 1 };
  return { year: curr.year, month: curr.month - 1, day: 1 };
}
function nextMonthOf(curr: BsDate): BsDate {
  if (curr.month === 12) return { year: curr.year + 1, month: 1, day: 1 };
  return { year: curr.year, month: curr.month + 1, day: 1 };
}

// ─── Calendar grid ────────────────────────────────────────────────────────────

interface CalendarGridProps {
  viewMonth: BsDate;
  recordMap: Map<string, string>;
  isLoading: boolean;
}

function CalendarGrid({ viewMonth, recordMap, isLoading }: CalendarGridProps) {
  const todayBsDate = todayBs();
  const { year, month } = viewMonth;

  const { weekdayOfFirst, daysInMonth } = useMemo(() => {
    const days = daysInBsMonth(year, month);
    const firstAd = bsToAd({ year, month, day: 1 });
    return { weekdayOfFirst: firstAd.getDay(), daysInMonth: days };
  }, [year, month]);

  const cells = useMemo<(number | null)[]>(() => {
    const result: (number | null)[] = [];
    for (let i = 0; i < weekdayOfFirst; i++) result.push(null);
    for (let d = 1; d <= daysInMonth; d++) result.push(d);
    return result;
  }, [weekdayOfFirst, daysInMonth]);

  function getAdStr(dayNum: number): string {
    const ad = bsToAd({ year, month, day: dayNum });
    return ad.toISOString().split('T')[0];
  }

  function isToday(dayNum: number): boolean {
    return todayBsDate.year === year && todayBsDate.month === month && todayBsDate.day === dayNum;
  }

  if (isLoading) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 32 }}>
        <ActivityIndicator size="small" color="#1e3a5f" />
        <Text style={{ color: '#9ca3af', fontSize: 13, marginTop: 8 }}>Loading calendar...</Text>
      </View>
    );
  }

  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === null)) {
    rows.pop();
  }

  return (
    <View>
      {/* Day headers */}
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        {DAY_HEADERS.map((d, i) => (
          <View key={d} style={{ width: CELL_SIZE, alignItems: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: i === 6 ? '#d97706' : '#6b7280' }}>
              {d}
            </Text>
          </View>
        ))}
      </View>

      {/* Rows */}
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', marginBottom: 4 }}>
          {row.map((day, ci) => {
            if (!day) {
              return <View key={ci} style={{ width: CELL_SIZE, height: CELL_SIZE }} />;
            }
            const adStr = getAdStr(day);
            const status = recordMap.get(adStr) as AttendanceStatus | undefined;
            const cfg = status ? STATUS_CONFIG[status] : null;
            const today = isToday(day);
            const isSat = ci === 6;

            return (
              <View
                key={ci}
                style={{
                  width: CELL_SIZE, height: CELL_SIZE,
                  borderRadius: CELL_SIZE / 2,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: today
                    ? '#1e3a5f'
                    : cfg?.bg ?? (isSat ? '#fffbeb' : 'transparent'),
                }}
              >
                <Text style={{
                  fontSize: 13, fontWeight: today ? '800' : '500',
                  color: today ? 'white' : cfg?.color ?? (isSat ? '#d97706' : '#374151'),
                }}>
                  {day}
                </Text>
                {status && !today && (
                  <View style={{
                    width: 4, height: 4, borderRadius: 2,
                    backgroundColor: cfg!.dot, marginTop: 1,
                  }} />
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ParentAttendance() {
  const [refreshing, setRefreshing] = useState(false);
  const [viewMonth, setViewMonth] = useState<BsDate>(() => {
    const t = todayBs();
    return { year: t.year, month: t.month, day: 1 };
  });

  const selectedChildId = useAuthStore((s) => s.selectedChildId);
  const setSelectedChildId = useAuthStore((s) => s.setSelectedChildId);
  const childrenQuery = useMyChildren();
  const children = childrenQuery.data ?? [];
  const effectiveChildId: string | null = selectedChildId ?? (children[0]?.id ?? null);
  if (!selectedChildId && effectiveChildId) setSelectedChildId(effectiveChildId);

  const selectedChild = children.find((c) => c.id === effectiveChildId) ?? null;
  const academicYearId = selectedChild?.currentEnrollment?.academicYearId ?? null;

  const summaryQuery = useChildAttendanceSummary(effectiveChildId ?? '', academicYearId);

  // Build AD range for the current BS month
  const { fromDate, toDate } = useMemo(() => {
    const totalDays = daysInBsMonth(viewMonth.year, viewMonth.month);
    const firstAd = bsToAd({ year: viewMonth.year, month: viewMonth.month, day: 1 });
    const lastAd = bsToAd({ year: viewMonth.year, month: viewMonth.month, day: totalDays });
    return {
      fromDate: firstAd.toISOString().split('T')[0],
      toDate: lastAd.toISOString().split('T')[0],
    };
  }, [viewMonth.year, viewMonth.month]);

  const historyQuery = useChildAttendanceHistory({
    childId: effectiveChildId ?? '',
    fromDate,
    toDate,
    page: 1,
    limit: 35,
  });

  const recordMap = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>();
    const items = historyQuery.data?.data ?? [];
    for (const item of items) {
      m.set(item.dateAd, item.status);
    }
    return m;
  }, [historyQuery.data]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([summaryQuery.refetch(), historyQuery.refetch()]);
    setRefreshing(false);
  };

  const s = summaryQuery.data;
  const monthLabel = `${BS_MONTH_NAMES_EN[viewMonth.month - 1]} ${viewMonth.year}`;

  const statusTotals = useMemo(() => {
    const t: Record<AttendanceStatus, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 };
    for (const status of recordMap.values()) {
      if (status in t) t[status as AttendanceStatus]++;
    }
    return t;
  }, [recordMap]);

  return (
    <ScrollView
      style={styles.root}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1e3a5f" />}
    >
      {/* Header */}
      <LinearGradient
        colors={['#0f172a', '#1e3a5f', '#1e40af']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: 56, paddingBottom: 72, paddingHorizontal: 20 }}
      >
        <Text style={{ color: '#93c5fd', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          {selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : 'Attendance'}
        </Text>
        <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 4 }}>
          Attendance
        </Text>
        {s && (
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20,
            paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 8,
          }}>
            <Text style={{ color: '#bfdbfe', fontSize: 12, fontWeight: '700' }}>
              {s.attendancePercent}% · {s.totalWorkingDays} days
            </Text>
          </View>
        )}

        {/* Child picker */}
        {children.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
            {children.map((c) => {
              const sel = c.id === effectiveChildId;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={{
                    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
                    backgroundColor: sel ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.12)',
                    marginRight: 8,
                  }}
                  onPress={() => setSelectedChildId(c.id)}
                >
                  <Text style={{ color: sel ? '#1e3a5f' : '#bfdbfe', fontSize: 13, fontWeight: '600' }}>
                    {c.firstName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </LinearGradient>

      <View style={{ marginTop: -52, paddingHorizontal: 16, paddingBottom: 32 }}>
        {/* Calendar card */}
        <View style={styles.card}>
          {/* Month nav */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <TouchableOpacity onPress={() => setViewMonth(prevMonthOf(viewMonth))} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={18} color="#1e3a5f" />
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>{monthLabel}</Text>
            <TouchableOpacity
              onPress={() => setViewMonth(nextMonthOf(viewMonth))}
              disabled={(() => {
                const t = todayBs();
                return viewMonth.year === t.year && viewMonth.month === t.month;
              })()}
              style={styles.navBtn}
            >
              <Ionicons name="chevron-forward" size={18} color="#1e3a5f" />
            </TouchableOpacity>
          </View>

          <CalendarGrid
            viewMonth={viewMonth}
            recordMap={recordMap}
            isLoading={historyQuery.isLoading}
          />
        </View>

        {/* Monthly summary strip */}
        <View style={[styles.card, { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 16 }]}>
          {(['PRESENT', 'ABSENT', 'LATE', 'LEAVE'] as AttendanceStatus[]).map((key) => {
            const cfg = STATUS_CONFIG[key];
            return (
              <View key={key} style={{ alignItems: 'center' }}>
                <View style={[styles.summaryDot, { backgroundColor: cfg.bg }]}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: cfg.color }}>
                    {statusTotals[key]}
                  </Text>
                </View>
                <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: '600', marginTop: 4 }}>
                  {cfg.label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Legend */}
        <View style={[styles.card, { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }]}>
          {(['PRESENT', 'ABSENT', 'LATE', 'LEAVE'] as AttendanceStatus[]).map((key) => {
            const cfg = STATUS_CONFIG[key];
            return (
              <View key={key} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cfg.dot, marginRight: 5 }} />
                <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '500' }}>{cfg.label}</Text>
              </View>
            );
          })}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#d97706', marginRight: 5 }} />
            <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '500' }}>Saturday</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafb' },
  card: {
    backgroundColor: 'white', borderRadius: 24, padding: 20, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center',
  },
  summaryDot: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
});
