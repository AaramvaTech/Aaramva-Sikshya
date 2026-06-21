import { View, Text, ScrollView, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { useState, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NpText from '../../components/NpText';
import { useAttendanceHistory, useMyAttendanceSummary } from '../../hooks/useStudentMe';
import { STATUS_CONFIG, type AttendanceStatus } from '../../lib/attendance';
import { todayBs, daysInBsMonth, bsToAd, BS_MONTH_NAMES_EN } from 'bs-calendar';
import type { BsDate } from 'bs-calendar';
import { localDateKey } from '../../lib/time';
import { SATURDAY_HIGHLIGHT, useThemeColors } from '../../lib/theme/colors';
import { MonthNav, AttendanceCalendar, Legend, ErrorState } from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';
import { FONT } from '../../lib/theme/fonts';

function prevMonthOf(curr: BsDate): BsDate {
  if (curr.month === 1) return { year: curr.year - 1, month: 12, day: 1 };
  return { year: curr.year, month: curr.month - 1, day: 1 };
}
function nextMonthOf(curr: BsDate): BsDate {
  if (curr.month === 12) return { year: curr.year + 1, month: 1, day: 1 };
  return { year: curr.year, month: curr.month + 1, day: 1 };
}

const STATUS_KEYS: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE'];
const STAT_KEYS: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE'];

export default function StudentAttendance() {
  const [refreshing, setRefreshing] = useState(false);
  const [viewMonth, setViewMonth] = useState<BsDate>(() => {
    const t = todayBs();
    return { year: t.year, month: t.month, day: 1 };
  });
  const c = useThemeColors();
  const insets = useSafeAreaInsets();

  const summaryResult = useMyAttendanceSummary();

  const { fromDate, toDate, daysInMonth } = useMemo(() => {
    const { year, month } = viewMonth;
    const days = daysInBsMonth(year, month);
    const firstAd = bsToAd({ year, month, day: 1 });
    const nextBs: BsDate = month === 12 ? { year: year + 1, month: 1, day: 1 } : { year, month: month + 1, day: 1 };
    const toAdDate = bsToAd(nextBs);
    toAdDate.setDate(toAdDate.getDate() - 1);
    return { fromDate: localDateKey(firstAd), toDate: localDateKey(toAdDate), daysInMonth: days };
  }, [viewMonth]);

  const historyResult = useAttendanceHistory({ fromDate, toDate, limit: daysInMonth + 1 });
  const records = historyResult.data?.data ?? [];
  const recordMap = useMemo(() => new Map(records.map((r) => [r.dateAd, r.status])), [records]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([summaryResult.refetch(), historyResult.refetch()]);
    setRefreshing(false);
  };

  const t = todayBs();
  const isCurrentMonth = viewMonth.year === t.year && viewMonth.month === t.month;
  const monthLabel = `${BS_MONTH_NAMES_EN[viewMonth.month - 1]} ${viewMonth.year}`;
  const summary = summaryResult.data;
  const annualPercent = summary?.attendancePercent ?? null;

  const legendItems = [
    ...STATUS_KEYS.map((k) => ({ label: STATUS_CONFIG[k].label, bg: STATUS_CONFIG[k].bg, border: STATUS_CONFIG[k].dot })),
    { label: 'Saturday', bg: SATURDAY_HIGHLIGHT.bg, border: SATURDAY_HIGHLIGHT.text },
  ];

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {/* Plain header */}
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border },
          ]}
        >
          <Text style={[styles.headerTitle, { color: c.foreground }]}>Attendance</Text>
          {annualPercent !== null && (
            <Text style={[styles.headerSub, { color: c.mutedForeground }]}>
              {annualPercent}% present this year
            </Text>
          )}
        </View>

        <View style={styles.body}>
          {/* Calendar card (month nav inside) */}
          <View style={[styles.card, CARD_SHADOW]}>
            <MonthNav
              label={monthLabel}
              variant="card"
              onPrev={() => setViewMonth(prevMonthOf(viewMonth))}
              onNext={() => setViewMonth(nextMonthOf(viewMonth))}
              nextDisabled={isCurrentMonth}
            />
            <View style={{ marginTop: 12 }}>
              <AttendanceCalendar
                viewMonth={viewMonth}
                recordMap={recordMap}
                statusConfig={STATUS_CONFIG}
                isLoading={historyResult.isLoading}
              />
            </View>
            {historyResult.isError && !historyResult.isLoading && (
              <View style={{ marginTop: 8 }}>
                <ErrorState compact title="Couldn't load this month." subtitle="" onRetry={() => historyResult.refetch()} />
              </View>
            )}
          </View>

          {/* Legend */}
          <View style={styles.legendWrap}>
            <Legend items={legendItems} />
          </View>

          {/* Annual stats */}
          {summary && (
            <View style={styles.statRow}>
              {STAT_KEYS.map((key) => {
                const cfg = STATUS_CONFIG[key];
                const val = key === 'PRESENT' ? summary.present : key === 'ABSENT' ? summary.absent : summary.late;
                return (
                  <View key={key} style={[styles.statCard, CARD_SHADOW]}>
                    <Text style={[styles.statNum, { color: cfg.color }]}>{val}</Text>
                    <Text style={[styles.statLabel, { color: c.mutedForeground }]}>{cfg.label}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {summary && (
            <NpText style={[styles.working, { color: c.mutedForeground }]}>
              {summary.totalWorkingDays} working days · {summary.academicYearName}
            </NpText>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  headerTitle: { fontFamily: FONT.extrabold, fontSize: 17 },
  headerSub: { fontFamily: FONT.regular, fontSize: 12, marginTop: 3 },

  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16 },

  legendWrap: { marginTop: 14, alignItems: 'center' },

  statRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  statNum: { fontFamily: FONT.extrabold, fontSize: 20 },
  statLabel: { fontFamily: FONT.bold, fontSize: 10, textTransform: 'uppercase', marginTop: 2 },

  working: { fontFamily: FONT.regular, fontSize: 12, textAlign: 'center', marginTop: 14 },
});
