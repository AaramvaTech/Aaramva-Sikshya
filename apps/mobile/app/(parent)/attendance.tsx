import { View, Text, ScrollView, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { useState, useMemo, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMyChildren, useChildAttendanceSummary, useChildAttendanceHistory } from '../../hooks/useParentChild';
import { useAuthStore } from '../../store/auth';
import { STATUS_CONFIG, type AttendanceStatus } from '../../lib/attendance';
import { useThemeColors, SATURDAY_HIGHLIGHT } from '../../lib/theme/colors';
import { MonthNav, AttendanceCalendar, Legend, ErrorState } from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';
import { FONT } from '../../lib/theme/fonts';
import NpText from '../../components/NpText';
import { todayBs, daysInBsMonth, bsToAd, BS_MONTH_NAMES_EN } from 'bs-calendar';
import type { BsDate } from 'bs-calendar';

function prevMonthOf(curr: BsDate): BsDate {
  if (curr.month === 1) return { year: curr.year - 1, month: 12, day: 1 };
  return { year: curr.year, month: curr.month - 1, day: 1 };
}
function nextMonthOf(curr: BsDate): BsDate {
  if (curr.month === 12) return { year: curr.year + 1, month: 1, day: 1 };
  return { year: curr.year, month: curr.month + 1, day: 1 };
}

const STATUS_KEYS: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE'];

export default function ParentAttendance() {
  const [refreshing, setRefreshing] = useState(false);
  const [viewMonth, setViewMonth] = useState<BsDate>(() => {
    const t = todayBs();
    return { year: t.year, month: t.month, day: 1 };
  });
  const c = useThemeColors();
  const insets = useSafeAreaInsets();

  const selectedChildId = useAuthStore((s) => s.selectedChildId);
  const setSelectedChildId = useAuthStore((s) => s.setSelectedChildId);
  const childrenQuery = useMyChildren();
  const children = childrenQuery.data ?? [];
  const effectiveChildId: string | null = selectedChildId ?? (children[0]?.id ?? null);
  useEffect(() => {
    if (!selectedChildId && effectiveChildId) setSelectedChildId(effectiveChildId);
  }, [selectedChildId, effectiveChildId, setSelectedChildId]);

  const selectedChild = children.find((ch) => ch.id === effectiveChildId) ?? null;
  const academicYearId = selectedChild?.currentEnrollment?.academicYearId ?? null;

  const summaryQuery = useChildAttendanceSummary(effectiveChildId ?? '', academicYearId);

  const { fromDate, toDate } = useMemo(() => {
    const totalDays = daysInBsMonth(viewMonth.year, viewMonth.month);
    const firstAd = bsToAd({ year: viewMonth.year, month: viewMonth.month, day: 1 });
    const lastAd = bsToAd({ year: viewMonth.year, month: viewMonth.month, day: totalDays });
    return { fromDate: firstAd.toISOString().split('T')[0], toDate: lastAd.toISOString().split('T')[0] };
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
    for (const item of historyQuery.data?.data ?? []) m.set(item.dateAd, item.status);
    return m;
  }, [historyQuery.data]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([summaryQuery.refetch(), historyQuery.refetch()]);
    setRefreshing(false);
  };

  const s = summaryQuery.data;
  const t = todayBs();
  const isCurrentMonth = viewMonth.year === t.year && viewMonth.month === t.month;
  const monthLabel = `${BS_MONTH_NAMES_EN[viewMonth.month - 1]} ${viewMonth.year}`;
  const childName = selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : '';

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
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border },
          ]}
        >
          <Text style={[styles.headerTitle, { color: c.foreground }]}>Attendance</Text>
          <NpText style={[styles.headerSub, { color: c.mutedForeground }]}>
            {childName}{s ? ` · ${s.attendancePercent}% present` : ''}
          </NpText>
        </View>

        <View style={styles.body}>
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
                isLoading={historyQuery.isLoading}
              />
            </View>
            {historyQuery.isError && !historyQuery.isLoading && (
              <View style={{ marginTop: 8 }}>
                <ErrorState compact title="Couldn't load this month." subtitle="" onRetry={() => historyQuery.refetch()} />
              </View>
            )}
          </View>

          <View style={styles.legendWrap}>
            <Legend items={legendItems} />
          </View>
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
});
