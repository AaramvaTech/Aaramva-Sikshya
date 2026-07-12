import { View, Text, ScrollView, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { useState, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import NpText from '../../components/NpText';
import { useAttendanceHistory, useMyAttendanceSummary, useMyProfile } from '../../hooks/useStudentMe';
import { STATUS_CONFIG, type AttendanceStatus } from '../../lib/attendance';
import { todayBs, daysInBsMonth, bsToAd, adToBs } from 'bs-calendar';
import type { BsDate } from 'bs-calendar';
import { localDateKey } from '../../lib/time';
import { SATURDAY_HIGHLIGHT, useThemeColors, brandMuted } from '../../lib/theme/colors';
import { MonthNav, AttendanceCalendar, Legend, ErrorState, ScreenHeader } from '../../components/ui';
import { useLocale } from '../../hooks/useLocale';
import { bsMonthName } from '../../lib/i18n/date';
import { FONT } from '../../lib/theme/fonts';
import type { AttendanceHistoryItem } from '../../types';

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
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function StudentAttendance() {
  const [refreshing, setRefreshing] = useState(false);
  const [viewMonth, setViewMonth] = useState<BsDate>(() => {
    const t = todayBs();
    return { year: t.year, month: t.month, day: 1 };
  });
  const c = useThemeColors();
  const { t, locale } = useLocale('student');

  const profileResult = useMyProfile();
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
    await Promise.all([profileResult.refetch(), summaryResult.refetch(), historyResult.refetch()]);
    setRefreshing(false);
  };

  const tbs = todayBs();
  const isCurrentMonth = viewMonth.year === tbs.year && viewMonth.month === tbs.month;
  const monthLabel = `${bsMonthName(viewMonth.month, locale)} ${viewMonth.year}`;
  const summary = summaryResult.data;
  const profile = profileResult.data;
  const enrollment = profile?.currentEnrollment;

  // Derived brand-tinted header subtitle colour (derived from school primary)
  const subtitleColor = brandMuted(c.primary);

  const legendItems = [
    ...STATUS_KEYS.map((k) => ({ label: t(STATUS_CONFIG[k].labelKey), bg: STATUS_CONFIG[k].bg, border: STATUS_CONFIG[k].dot })),
    { label: t('common:attendance.saturday'), bg: SATURDAY_HIGHLIGHT.bg, border: SATURDAY_HIGHLIGHT.text },
  ];

  // Recent activity: last 5 records from current month data, sorted newest-first
  const recentActivity = useMemo<AttendanceHistoryItem[]>(() => {
    if (!records.length) return [];
    return [...records]
      .filter((r) => r.status !== undefined)
      .sort((a, b) => (a.dateAd > b.dateAd ? -1 : 1))
      .slice(0, 5);
  }, [records]);

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {/* Brand-tinted header band */}
        <ScreenHeader variant="hero" bare rounded padTop={14} padBottom={18}>
          <NpText style={[styles.headerTitle, { color: c.foreground }]}>{t('attendance.title')}</NpText>
          <NpText style={[styles.headerSub, { color: subtitleColor }]}>
            {enrollment ? `${t('attendance.classPrefix', { label: `${enrollment.className}${enrollment.sectionName}` })} · ` : ''}
            {summary?.academicYearName ?? t('attendance.academicYearThis')}
          </NpText>

          {/* 3 stat tiles */}
          {summary && (
            <View style={styles.statRow}>
              {STAT_KEYS.map((key) => {
                const cfg = STATUS_CONFIG[key];
                const val = key === 'PRESENT' ? summary.present : key === 'ABSENT' ? summary.absent : summary.late;
                return (
                  <View key={key} style={[styles.statTile, { backgroundColor: c.surface }]}>
                    <Text style={[styles.statNum, { color: cfg.color }]}>{val}</Text>
                    <NpText style={[styles.statLabel, { color: cfg.color }]}>{t(cfg.labelKey).toUpperCase()}</NpText>
                  </View>
                );
              })}
            </View>
          )}
        </ScreenHeader>

        <View style={styles.body}>
          {/* Calendar card (month nav + grid + legend inside) */}
          <View style={[styles.card, styles.cardShadow, { backgroundColor: c.surface }]}>
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
                <ErrorState compact title={t('attendance.errorMonth')} subtitle="" onRetry={() => historyResult.refetch()} />
              </View>
            )}
            {/* Legend inside card with top separator */}
            <View style={styles.legendSep} />
            <View style={styles.legendWrap}>
              <Legend items={legendItems} />
            </View>
          </View>

          {/* Recent activity */}
          {recentActivity.length > 0 && (
            <>
              <NpText style={[styles.recentLabel, { color: c.mutedForeground }]}>{t('attendance.recentActivity')}</NpText>
              <View style={[styles.recentCard, styles.recentShadow, { backgroundColor: c.surface }]}>
                {recentActivity.map((item, idx) => {
                  const cfg = STATUS_CONFIG[item.status as AttendanceStatus];
                  if (!cfg) return null;
                  const adDate = new Date(item.dateAd + 'T00:00:00');
                  const bsDate = adToBs(adDate);
                  const bsLabel = `${bsMonthName(bsDate.month, locale)} ${bsDate.day}, ${bsDate.year}`;
                  const dowLabel = (t('common:days.short', { returnObjects: true }) as string[])[adDate.getDay()];
                  const isLast = idx === recentActivity.length - 1;
                  return (
                    <View
                      key={item.dateAd}
                      style={[styles.activityRow, !isLast && { borderBottomWidth: 1, borderBottomColor: c.border }]}
                    >
                      <View style={[styles.activityIcon, { backgroundColor: cfg.bg }]}>
                        <Ionicons name={cfg.icon as any} size={19} color={cfg.dot} />
                      </View>
                      <View style={styles.activityText}>
                        <Text style={[styles.activityDate, { color: c.foreground }]}>{bsLabel}</Text>
                        <Text style={[styles.activityDow, { color: c.mutedForeground }]}>{dowLabel}</Text>
                      </View>
                      <Text style={[styles.activityStatus, { color: cfg.dot }]}>{cfg.label}</Text>
                    </View>
                  );
                })}
              </View>
            </>
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

  headerTitle: { fontFamily: FONT.extrabold, fontSize: 17 },
  headerSub: { fontFamily: FONT.semibold, fontSize: 11.5, marginTop: 2 },

  // Stat tiles in the header
  statRow: { flexDirection: 'row', gap: 7, marginTop: 12 },
  statTile: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 11,
    alignItems: 'center',
  },
  statNum: { fontFamily: FONT.extrabold, fontSize: 14 },
  statLabel: { fontFamily: FONT.bold, fontSize: 8.5, marginTop: 1 },

  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },

  // Calendar card
  card: { borderRadius: 20, padding: 16 },
  cardShadow: {
    shadowColor: '#10231A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 4,
  },

  // Legend inside card
  legendSep: { height: 1, backgroundColor: '#F0F3F0', marginTop: 15, marginBottom: 14 },
  legendWrap: { alignItems: 'center' },

  // Recent activity
  recentLabel: { fontFamily: FONT.extrabold, fontSize: 12, marginTop: 20, marginBottom: 11, marginHorizontal: 2 },
  recentCard: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 2 },
  recentShadow: {
    shadowColor: '#10231A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 3,
  },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  activityIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  activityText: { flex: 1 },
  activityDate: { fontFamily: FONT.bold, fontSize: 12.5 },
  activityDow: { fontFamily: FONT.regular, fontSize: 10.5, marginTop: 1 },
  activityStatus: { fontFamily: FONT.extrabold, fontSize: 11 },

  working: { fontFamily: FONT.regular, fontSize: 12, textAlign: 'center', marginTop: 14 },
});
