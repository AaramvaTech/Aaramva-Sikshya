import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, useMemo } from 'react';
import { useAttendanceHistory, useMyAttendanceSummary } from '../../hooks/useStudentMe';
import { STATUS_CONFIG } from '../../lib/attendance';
import type { AttendanceStatus } from '../../lib/attendance';
import { todayBs, daysInBsMonth, bsToAd, BS_MONTH_NAMES_EN } from 'bs-calendar';
import type { BsDate } from 'bs-calendar';

const SCREEN_WIDTH = Dimensions.get('window').width;
// 16px padding each side, 16px card padding each side = 64px total horizontal offset
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 64) / 7);

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Month navigation ──────────────────────────────────────────────────────────

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
    return (
      todayBsDate.year === year &&
      todayBsDate.month === month &&
      todayBsDate.day === dayNum
    );
  }

  if (isLoading) {
    return (
      <View style={styles.calendarLoadingContainer}>
        <ActivityIndicator size="small" color="#065f46" />
        <Text style={styles.calendarLoadingText}>Loading calendar...</Text>
      </View>
    );
  }

  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return (
    <View>
      {/* Day header row */}
      <View style={styles.calendarRow}>
        {DAY_HEADERS.map((day, idx) => (
          <View key={day} style={[styles.dayHeader, idx === 6 && styles.saturdayHeader]}>
            <Text style={[styles.dayHeaderText, idx === 6 && styles.saturdayHeaderText]}>
              {day}
            </Text>
          </View>
        ))}
      </View>

      {/* Week rows */}
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.calendarRow}>
          {row.map((dayNum, colIdx) => {
            if (dayNum === null) {
              return <View key={`blank-${colIdx}`} style={styles.cell} />;
            }

            const adStr = getAdStr(dayNum);
            const status = (recordMap.get(adStr) ?? null) as AttendanceStatus | null;
            const cfg = status ? STATUS_CONFIG[status] : null;
            const today = isToday(dayNum);
            const isSaturday = colIdx === 6;

            const cellBg = cfg
              ? cfg.bg
              : isSaturday
              ? '#fef9ee'
              : '#f3f4f6';

            return (
              <View
                key={dayNum}
                style={[
                  styles.cell,
                  { backgroundColor: cellBg },
                  today && styles.todayCell,
                ]}
              >
                <Text
                  style={[
                    styles.cellDayNum,
                    cfg ? { color: cfg.color } : isSaturday ? { color: '#d97706' } : styles.cellDayNumDefault,
                    today && styles.todayText,
                  ]}
                >
                  {dayNum}
                </Text>
                {cfg ? (
                  <Text style={[styles.cellCode, { color: cfg.color }]}>{cfg.shortCode}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Mini summary strip ────────────────────────────────────────────────────────

interface MonthlyCounts {
  PRESENT: number;
  ABSENT: number;
  LATE: number;
  LEAVE: number;
}

function MonthlySummaryStrip({ counts }: { counts: MonthlyCounts }) {
  const items: { key: AttendanceStatus; label: string }[] = [
    { key: 'PRESENT', label: 'P' },
    { key: 'ABSENT',  label: 'A' },
    { key: 'LATE',    label: 'L' },
    { key: 'LEAVE',   label: 'LV' },
  ];

  return (
    <View style={styles.summaryStrip}>
      {items.map(({ key, label }, idx) => {
        const cfg = STATUS_CONFIG[key];
        return (
          <View key={key} style={[styles.summaryItem, idx > 0 && styles.summaryItemBorder]}>
            <Text style={[styles.summaryCode, { color: cfg.color }]}>{label}</Text>
            <Text style={[styles.summaryCount, { color: cfg.color }]}>{counts[key]}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <View style={styles.legend}>
      {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((key) => {
        const cfg = STATUS_CONFIG[key];
        return (
          <View key={key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: cfg.bg, borderColor: cfg.dot }]} />
            <Text style={styles.legendLabel}>{cfg.label}</Text>
          </View>
        );
      })}
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: '#fef9ee', borderColor: '#d97706' }]} />
        <Text style={styles.legendLabel}>Saturday</Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function StudentAttendance() {
  const [refreshing, setRefreshing] = useState(false);
  const [viewMonth, setViewMonth] = useState<BsDate>(() => {
    const t = todayBs();
    return { year: t.year, month: t.month, day: 1 };
  });

  const summaryResult = useMyAttendanceSummary();

  // Compute AD date range for the viewed BS month
  const { fromDate, toDate, daysInMonth } = useMemo(() => {
    const { year, month } = viewMonth;
    const days = daysInBsMonth(year, month);

    const firstAd = bsToAd({ year, month, day: 1 });

    const nextBs: BsDate =
      month === 12
        ? { year: year + 1, month: 1, day: 1 }
        : { year, month: month + 1, day: 1 };
    const toAdDate = bsToAd(nextBs);
    toAdDate.setDate(toAdDate.getDate() - 1);

    return {
      fromDate: firstAd.toISOString().split('T')[0],
      toDate: toAdDate.toISOString().split('T')[0],
      daysInMonth: days,
    };
  }, [viewMonth]);

  const historyResult = useAttendanceHistory({
    fromDate,
    toDate,
    limit: daysInMonth + 1,
  });

  const records = historyResult.data?.data ?? [];

  const recordMap = useMemo(
    () => new Map(records.map((r) => [r.dateAd, r.status])),
    [records],
  );

  const monthlyCounts = useMemo<MonthlyCounts>(() => {
    const counts: MonthlyCounts = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 };
    records.forEach((r) => {
      if (r.status in counts) counts[r.status as AttendanceStatus]++;
    });
    return counts;
  }, [records]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([summaryResult.refetch(), historyResult.refetch()]);
    setRefreshing(false);
  };

  const monthName = BS_MONTH_NAMES_EN[viewMonth.month - 1];
  const annualPercent = summaryResult.data?.attendancePercent ?? null;

  return (
    <ScrollView
      style={styles.root}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#065f46" />
      }
    >
      {/* ── Gradient header with month nav ── */}
      <LinearGradient
        colors={['#064e3b', '#065f46', '#047857']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        {annualPercent !== null && (
          <Text style={styles.headerSubtitle}>
            Annual attendance: {annualPercent}%
          </Text>
        )}
        <Text style={styles.headerTitle}>My Attendance</Text>

        {/* Month navigation */}
        <View style={styles.monthNav}>
          <TouchableOpacity
            onPress={() => setViewMonth(prevMonthOf(viewMonth))}
            style={styles.navBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={20} color="white" />
          </TouchableOpacity>

          <Text style={styles.monthNavTitle}>
            {monthName} {viewMonth.year}
          </Text>

          <TouchableOpacity
            onPress={() => setViewMonth(nextMonthOf(viewMonth))}
            style={styles.navBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-forward" size={20} color="white" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* ── Cards area ── */}
      <View style={styles.body}>

        {/* Calendar card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Attendance Calendar</Text>

          <CalendarGrid
            viewMonth={viewMonth}
            recordMap={recordMap}
            isLoading={historyResult.isLoading}
          />

          {historyResult.isError && !historyResult.isLoading && (
            <View style={styles.errorRow}>
              <Text style={styles.errorText}>Failed to load attendance data.</Text>
              <TouchableOpacity onPress={() => historyResult.refetch()} style={styles.retryBtn}>
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Legend card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Legend</Text>
          <Legend />
        </View>

        {/* Monthly summary strip card */}
        <View style={[styles.card, styles.summaryCard]}>
          <Text style={styles.cardLabel}>This Month</Text>
          <MonthlySummaryStrip counts={monthlyCounts} />
        </View>

        {/* Annual summary line from summary endpoint */}
        {summaryResult.data && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Annual Overview</Text>
            <View style={styles.annualRow}>
              {(
                [
                  { key: 'present' as const,  label: 'Present', statusKey: 'PRESENT' as AttendanceStatus },
                  { key: 'absent'  as const,  label: 'Absent',  statusKey: 'ABSENT'  as AttendanceStatus },
                  { key: 'late'    as const,  label: 'Late',    statusKey: 'LATE'    as AttendanceStatus },
                  { key: 'leave'   as const,  label: 'Leave',   statusKey: 'LEAVE'   as AttendanceStatus },
                ] as const
              ).map(({ key, label, statusKey }) => {
                const cfg = STATUS_CONFIG[statusKey];
                return (
                  <View key={key} style={styles.annualStatBox}>
                    <Text style={[styles.annualStatNum, { color: cfg.color }]}>
                      {summaryResult.data![key]}
                    </Text>
                    <Text style={styles.annualStatLabel}>{label}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.annualWorkingDays}>
              {summaryResult.data.totalWorkingDays} working days · {summaryResult.data.academicYearName}
            </Text>
          </View>
        )}

      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },

  // Header
  header: {
    paddingTop: 56,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerSubtitle: {
    color: '#6ee7b7',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  headerTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 20,
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
  navBtn: {
    padding: 4,
  },
  monthNavTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Body
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 12,
  },

  // Cards
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

  // Calendar grid
  calendarLoadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  calendarLoadingText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  calendarRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayHeader: {
    width: CELL_SIZE,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saturdayHeader: {
    // no extra background on header row — just text color change
  },
  dayHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
  },
  saturdayHeaderText: {
    color: '#d97706',
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 1,
  },
  todayCell: {
    borderWidth: 2,
    borderColor: '#065f46',
  },
  cellDayNum: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  cellDayNumDefault: {
    color: '#6b7280',
  },
  todayText: {
    color: '#065f46',
  },
  cellCode: {
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
    marginTop: 1,
  },

  // Error
  errorRow: {
    alignItems: 'center',
    paddingTop: 12,
    gap: 8,
  },
  errorText: {
    color: '#6b7280',
    fontSize: 13,
  },
  retryBtn: {
    backgroundColor: '#065f46',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  retryBtnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 13,
  },

  // Legend
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  legendLabel: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },

  // Monthly summary strip
  summaryCard: {
    // uses standard card style
  },
  summaryStrip: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryItemBorder: {
    borderLeftWidth: 1,
    borderLeftColor: '#f3f4f6',
  },
  summaryCode: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  summaryCount: {
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 30,
    marginTop: 2,
  },

  // Annual overview
  annualRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  annualStatBox: {
    alignItems: 'center',
  },
  annualStatNum: {
    fontSize: 22,
    fontWeight: '800',
  },
  annualStatLabel: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '600',
    marginTop: 2,
  },
  annualWorkingDays: {
    textAlign: 'center',
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
});
