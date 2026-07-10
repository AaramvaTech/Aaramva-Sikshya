import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useState, useMemo } from 'react';
import { useMyStaffSummary, useMyStaffAttendance } from '../../hooks/useTeacher';
import { todayBs, daysInBsMonth, bsToAd, BS_MONTH_NAMES_EN } from 'bs-calendar';
import type { BsDate } from 'bs-calendar';
import type { StaffAttendanceRecord } from '../../types';
import { useThemeColors, SATURDAY_HIGHLIGHT } from '../../lib/theme/colors';
import { localDateKey } from '../../lib/time';
import {
  ScreenHeader, MonthNav, Card, CardLabel, AttendanceCalendar, Legend, ErrorState,
  type CalendarStatusStyle,
} from '../../components/ui';

type StaffStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'HOLIDAY';

// Semantic staff-attendance palette (not brand-coupled).
const STAFF_STATUS: Record<StaffStatus, CalendarStatusStyle & { dot: string; label: string }> = {
  PRESENT: { bg: '#d1fae5', color: '#065f46', dot: '#059669', shortCode: 'P', label: 'Present' },
  ABSENT:  { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444', shortCode: 'A', label: 'Absent' },
  LATE:    { bg: '#fef3c7', color: '#92400e', dot: '#d97706', shortCode: 'L', label: 'Late' },
  LEAVE:   { bg: '#dbeafe', color: '#1d4ed8', dot: '#3b82f6', shortCode: 'LV', label: 'Leave' },
  HOLIDAY: { bg: '#f3f4f6', color: '#6b7280', dot: '#9ca3af', shortCode: 'H', label: 'Holiday' },
};

function prevMonthOf(curr: BsDate): BsDate {
  if (curr.month === 1) return { year: curr.year - 1, month: 12, day: 1 };
  return { year: curr.year, month: curr.month - 1, day: 1 };
}
function nextMonthOf(curr: BsDate): BsDate {
  if (curr.month === 12) return { year: curr.year + 1, month: 1, day: 1 };
  return { year: curr.year, month: curr.month + 1, day: 1 };
}

export default function TeacherMyAttendance() {
  const [refreshing, setRefreshing] = useState(false);
  const [viewMonth, setViewMonth] = useState<BsDate>(() => {
    const t = todayBs();
    return { year: t.year, month: t.month, day: 1 };
  });
  const c = useThemeColors();

  const summaryResult = useMyStaffSummary(viewMonth.year, viewMonth.month);

  const { fromDate, toDate, daysInMonth } = useMemo(() => {
    const { year, month } = viewMonth;
    const days = daysInBsMonth(year, month);
    const firstAd = bsToAd({ year, month, day: 1 });
    const nextBs: BsDate = month === 12 ? { year: year + 1, month: 1, day: 1 } : { year, month: month + 1, day: 1 };
    const toAdDate = bsToAd(nextBs);
    toAdDate.setDate(toAdDate.getDate() - 1);
    // localDateKey is TZ-safe; toISOString would shift these local-midnight
    // month-boundary dates back a day at Nepal's +05:45 offset.
    return {
      fromDate: localDateKey(firstAd),
      toDate: localDateKey(toAdDate),
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

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([summaryResult.refetch(), historyResult.refetch()]);
    setRefreshing(false);
  };

  const t = todayBs();
  const isCurrentMonth = viewMonth.year === t.year && viewMonth.month === t.month;
  const monthLabel = `${BS_MONTH_NAMES_EN[viewMonth.month - 1]} ${viewMonth.year}`;

  const legendItems = [
    ...(Object.keys(STAFF_STATUS) as StaffStatus[]).map((k) => ({
      label: STAFF_STATUS[k].label, bg: STAFF_STATUS[k].bg, border: STAFF_STATUS[k].dot,
    })),
    { label: 'Saturday', bg: SATURDAY_HIGHLIGHT.bg, border: SATURDAY_HIGHLIGHT.text },
  ];

  return (
    <ScrollView
      className="bg-background"
      style={styles.fill}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
    >
      <ScreenHeader title="My Attendance">
        <View style={styles.navWrap}>
          <MonthNav
            label={monthLabel}
            variant="header"
            onPrev={() => setViewMonth(prevMonthOf(viewMonth))}
            onNext={() => setViewMonth(nextMonthOf(viewMonth))}
            nextDisabled={isCurrentMonth}
          />
        </View>
      </ScreenHeader>

      <View style={styles.body}>
        {(summaryResult.isError || historyResult.isError) ? (
          <Card padded>
            <ErrorState
              compact
              title="Couldn't load attendance"
              onRetry={() => { void summaryResult.refetch(); void historyResult.refetch(); }}
            />
          </Card>
        ) : (
        <>
        {/* Summary */}
        {summaryResult.data && (
          <Card padded>
            <CardLabel>Monthly Summary</CardLabel>
            <View style={styles.summaryRow}>
              {(['PRESENT', 'ABSENT', 'LATE', 'LEAVE'] as const).map((s) => {
                const cfg = STAFF_STATUS[s];
                const value = summaryResult.data![s.toLowerCase() as keyof typeof summaryResult.data] as number;
                return (
                  <View key={s} style={styles.summaryItem}>
                    <Text style={[styles.summaryNum, { color: cfg.color }]}>{value}</Text>
                    <Text className="text-muted-foreground" style={styles.summaryLabel}>{cfg.label}</Text>
                  </View>
                );
              })}
            </View>
          </Card>
        )}

        {/* Calendar */}
        <Card padded>
          <CardLabel>Attendance Calendar</CardLabel>
          <AttendanceCalendar
            viewMonth={viewMonth}
            recordMap={recordMap}
            statusConfig={STAFF_STATUS}
            isLoading={historyResult.isLoading}
          />
        </Card>

        {/* Legend */}
        <Card padded>
          <CardLabel>Legend</CardLabel>
          <Legend items={legendItems} />
        </Card>
        </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  navWrap: { marginTop: 14 },
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, gap: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center', flex: 1 },
  summaryNum: { fontSize: 24, fontWeight: '800' },
  summaryLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
});
