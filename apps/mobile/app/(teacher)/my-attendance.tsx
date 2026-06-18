import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, useMemo } from 'react';
import { useMyStaffSummary, useMyStaffAttendance } from '../../hooks/useTeacher';
import { todayBs, daysInBsMonth, bsToAd, BS_MONTH_NAMES_EN } from 'bs-calendar';
import type { BsDate } from 'bs-calendar';
import type { StaffAttendanceRecord } from '../../types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 64) / 7);
const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type StaffStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'HOLIDAY';

const STAFF_STATUS_STYLE: Record<StaffStatus, { bg: string; color: string; dot: string; shortCode: string; label: string }> = {
  PRESENT: { bg: '#d1fae5', color: '#065f46', dot: '#059669', shortCode: 'P',  label: 'Present' },
  ABSENT:  { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444', shortCode: 'A',  label: 'Absent' },
  LATE:    { bg: '#fef3c7', color: '#92400e', dot: '#d97706', shortCode: 'L',  label: 'Late' },
  LEAVE:   { bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6', shortCode: 'LV', label: 'Leave' },
  HOLIDAY: { bg: '#f3f4f6', color: '#6b7280', dot: '#9ca3af', shortCode: 'H',  label: 'Holiday' },
};

function prevMonthOf(curr: BsDate): BsDate {
  if (curr.month === 1) return { year: curr.year - 1, month: 12, day: 1 };
  return { year: curr.year, month: curr.month - 1, day: 1 };
}

function nextMonthOf(curr: BsDate): BsDate {
  if (curr.month === 12) return { year: curr.year + 1, month: 1, day: 1 };
  return { year: curr.year, month: curr.month + 1, day: 1 };
}

// ─── Calendar grid ─────────────────────────────────────────────────────────────

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
      <View style={styles.calendarLoadingContainer}>
        <ActivityIndicator size="small" color="#1e40af" />
        <Text style={styles.calendarLoadingText}>Loading calendar...</Text>
      </View>
    );
  }

  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <View>
      <View style={styles.calendarRow}>
        {DAY_HEADERS.map((day, idx) => (
          <View key={day} style={[styles.dayHeader, idx === 6 && styles.saturdayHeader]}>
            <Text style={[styles.dayHeaderText, idx === 6 && styles.saturdayHeaderText]}>{day}</Text>
          </View>
        ))}
      </View>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.calendarRow}>
          {row.map((dayNum, colIdx) => {
            if (dayNum === null) return <View key={`blank-${colIdx}`} style={styles.cell} />;
            const adStr = getAdStr(dayNum);
            const status = (recordMap.get(adStr) ?? null) as StaffStatus | null;
            const cfg = status ? STAFF_STATUS_STYLE[status] : null;
            const today = isToday(dayNum);
            const isSaturday = colIdx === 6;
            const cellBg = cfg ? cfg.bg : isSaturday ? '#fef9ee' : '#f3f4f6';
            return (
              <View key={dayNum} style={[styles.cell, { backgroundColor: cellBg }, today && styles.todayCell]}>
                <Text style={[
                  styles.cellDayNum,
                  cfg ? { color: cfg.color } : isSaturday ? { color: '#d97706' } : styles.cellDayNumDefault,
                  today && styles.todayText,
                ]}>
                  {dayNum}
                </Text>
                {cfg ? <Text style={[styles.cellCode, { color: cfg.color }]}>{cfg.shortCode}</Text> : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function TeacherMyAttendance() {
  const [refreshing, setRefreshing] = useState(false);
  const [viewMonth, setViewMonth] = useState<BsDate>(() => {
    const t = todayBs();
    return { year: t.year, month: t.month, day: 1 };
  });

  const adYear = new Date(bsToAd({ year: viewMonth.year, month: viewMonth.month, day: 1 })).getFullYear();
  const adMonth = new Date(bsToAd({ year: viewMonth.year, month: viewMonth.month, day: 1 })).getMonth() + 1;

  const summaryResult = useMyStaffSummary(viewMonth.year, viewMonth.month);

  const { fromDate, toDate, daysInMonth } = useMemo(() => {
    const { year, month } = viewMonth;
    const days = daysInBsMonth(year, month);
    const firstAd = bsToAd({ year, month, day: 1 });
    const nextBs: BsDate = month === 12 ? { year: year + 1, month: 1, day: 1 } : { year, month: month + 1, day: 1 };
    const toAdDate = bsToAd(nextBs);
    toAdDate.setDate(toAdDate.getDate() - 1);
    return {
      fromDate: firstAd.toISOString().split('T')[0],
      toDate: toAdDate.toISOString().split('T')[0],
      daysInMonth: days,
    };
  }, [viewMonth]);

  const historyResult = useMyStaffAttendance({ fromDate, toDate, limit: daysInMonth + 1 });

  const recordMap = useMemo(() => {
    const records = historyResult.data ?? [];
    return new Map(records.map((r: StaffAttendanceRecord) => {
      const dateStr = typeof r.date === 'string' ? r.date.split('T')[0] : String(r.date);
      return [dateStr, r.status];
    }));
  }, [historyResult.data]);

  const monthlyCounts = useMemo(() => {
    const counts: Record<StaffStatus, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0, HOLIDAY: 0 };
    (historyResult.data ?? []).forEach((r: StaffAttendanceRecord) => {
      const s = r.status as StaffStatus;
      if (s in counts) counts[s]++;
    });
    return counts;
  }, [historyResult.data]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([summaryResult.refetch(), historyResult.refetch()]);
    setRefreshing(false);
  };

  const monthName = BS_MONTH_NAMES_EN[viewMonth.month - 1];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f9fafb' }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1e40af" />}
    >
      <LinearGradient
        colors={['#1e3a8a', '#1e40af', '#2563eb']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>My Attendance</Text>
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => setViewMonth(prevMonthOf(viewMonth))} style={styles.navBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={20} color="white" />
          </TouchableOpacity>
          <Text style={styles.monthNavTitle}>{monthName} {viewMonth.year}</Text>
          <TouchableOpacity onPress={() => setViewMonth(nextMonthOf(viewMonth))} style={styles.navBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-forward" size={20} color="white" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={styles.body}>

        {/* Summary from /summary endpoint */}
        {summaryResult.data && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Monthly Summary</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              {(['PRESENT', 'ABSENT', 'LATE', 'LEAVE'] as const).map((s) => {
                const cfg = STAFF_STATUS_STYLE[s];
                return (
                  <View key={s} style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={{ fontSize: 24, fontWeight: '800', color: cfg.color }}>
                      {summaryResult.data![s.toLowerCase() as keyof typeof summaryResult.data] as number}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '600', marginTop: 2 }}>
                      {cfg.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Calendar card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Attendance Calendar</Text>
          <CalendarGrid
            viewMonth={viewMonth}
            recordMap={recordMap}
            isLoading={historyResult.isLoading}
          />
        </View>

        {/* Legend */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Legend</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {(Object.keys(STAFF_STATUS_STYLE) as StaffStatus[]).map((key) => {
              const cfg = STAFF_STATUS_STYLE[key];
              return (
                <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 14, height: 14, borderRadius: 4,
                    backgroundColor: cfg.bg, borderWidth: 1.5, borderColor: cfg.dot }} />
                  <Text style={{ fontSize: 12, color: '#374151', fontWeight: '500' }}>{cfg.label}</Text>
                </View>
              );
            })}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 14, height: 14, borderRadius: 4,
                backgroundColor: '#fef9ee', borderWidth: 1.5, borderColor: '#d97706' }} />
              <Text style={{ fontSize: 12, color: '#374151', fontWeight: '500' }}>Saturday</Text>
            </View>
          </View>
        </View>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 56,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 16,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  navBtn: { padding: 4 },
  monthNavTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  cardLabel: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  calendarLoadingContainer: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  calendarLoadingText: { color: '#9ca3af', fontSize: 13 },
  calendarRow: { flexDirection: 'row', marginBottom: 4 },
  dayHeader: { width: CELL_SIZE, height: 28, alignItems: 'center', justifyContent: 'center' },
  saturdayHeader: {},
  dayHeaderText: { fontSize: 11, fontWeight: '700', color: '#6b7280' },
  saturdayHeaderText: { color: '#d97706' },
  cell: {
    width: CELL_SIZE, height: CELL_SIZE, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', marginRight: 1,
  },
  todayCell: { borderWidth: 2, borderColor: '#1e40af' },
  cellDayNum: { fontSize: 12, fontWeight: '700', lineHeight: 14 },
  cellDayNumDefault: { color: '#6b7280' },
  todayText: { color: '#1e40af' },
  cellCode: { fontSize: 9, fontWeight: '800', lineHeight: 11, marginTop: 1 },
});
