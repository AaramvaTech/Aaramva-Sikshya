import { View, Text, ScrollView, RefreshControl, StatusBar, StyleSheet, TouchableOpacity } from 'react-native';
import { useState, useMemo, useEffect } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useMyChildren, useChildAttendanceSummary, useChildAttendanceHistory } from '../../hooks/useParentChild';
import { useAuthStore } from '../../store/auth';
import { STATUS_CONFIG, type AttendanceStatus } from '../../lib/attendance';
import { useLocale } from '../../hooks/useLocale';
import { bsMonthName } from '../../lib/i18n/date';
import NpText from '../../components/NpText';
import { useThemeColors, SATURDAY_HIGHLIGHT, brandSurface, brandMuted } from '../../lib/theme/colors';
import { MonthNav, AttendanceCalendar, Legend, ErrorState, ScreenHeader } from '../../components/ui';
import { FONT } from '../../lib/theme/fonts';
import { localDateKey } from '../../lib/time';
import { todayBs, daysInBsMonth, bsToAd, adToBs } from 'bs-calendar';
import type { BsDate } from 'bs-calendar';
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

export default function ParentAttendance() {
  const [refreshing, setRefreshing] = useState(false);
  const [viewMonth, setViewMonth] = useState<BsDate>(() => {
    const t = todayBs();
    return { year: t.year, month: t.month, day: 1 };
  });
  const c = useThemeColors();
  const { t, locale } = useLocale('parent');

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
    // localDateKey is TZ-safe; toISOString would shift these local-midnight
    // month-boundary dates back a day at Nepal's +05:45 offset.
    return { fromDate: localDateKey(firstAd), toDate: localDateKey(lastAd) };
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
  const tbs = todayBs();
  const isCurrentMonth = viewMonth.year === tbs.year && viewMonth.month === tbs.month;
  const monthLabel = `${bsMonthName(viewMonth.month, locale)} ${viewMonth.year}`;
  const childName = selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : '';

  // Derived brand-tinted header colours (no raw hex — all derived from school primary)
  const bandBg = brandSurface(c.primary);
  const subtitleColor = brandMuted(c.primary);

  const legendItems = [
    ...STATUS_KEYS.map((k) => ({ label: t(STATUS_CONFIG[k].labelKey), bg: STATUS_CONFIG[k].bg, border: STATUS_CONFIG[k].dot })),
    { label: t('common:attendance.saturday'), bg: SATURDAY_HIGHLIGHT.bg, border: SATURDAY_HIGHLIGHT.text },
  ];

  // Recent activity: last 5 records from current month data, sorted newest-first
  const records = historyQuery.data?.data ?? [];
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
        {/* Brand-tinted header band with rounded bottom corners */}
        <ScreenHeader variant="hero" bare rounded padTop={14} padBottom={18}>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <NpText style={[styles.headerTitle, { color: c.foreground }]}>{t('attendance.title')}</NpText>
              <NpText style={[styles.headerSub, { color: subtitleColor }]}>
                {childName ? `${childName} · ` : ''}{s?.academicYearName ?? t('attendance.academicYearThis')}
              </NpText>

              {/* 3 stat tiles */}
              {s && (
                <View style={styles.statRow}>
                  {STAT_KEYS.map((key) => {
                    const cfg = STATUS_CONFIG[key];
                    const val = key === 'PRESENT' ? s.present : key === 'ABSENT' ? s.absent : s.late;
                    return (
                      <View key={key} style={[styles.statTile, { backgroundColor: c.surface }]}>
                        <Text style={[styles.statNum, { color: cfg.color }]}>{val}</Text>
                        <NpText style={[styles.statLabel, { color: cfg.color }]}>{t(cfg.labelKey).toUpperCase()}</NpText>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Percentage ring */}
            {s && (
              <View style={[styles.ringOuter, { backgroundColor: STATUS_CONFIG.PRESENT.dot + '33' }]}>
                <View style={[styles.ringInner, { backgroundColor: bandBg }]}>
                  <Text style={[styles.ringPercent, { color: c.foreground }]}>{s.attendancePercent}%</Text>
                  <NpText style={[styles.ringLabel, { color: subtitleColor }]}>{t('common:attendance.present').toUpperCase()}</NpText>
                </View>
              </View>
            )}
          </View>
        </ScreenHeader>

        <View style={styles.body}>
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
                isLoading={historyQuery.isLoading}
              />
            </View>
            {historyQuery.isError && !historyQuery.isLoading && (
              <View style={{ marginTop: 8 }}>
                <ErrorState compact title={t('attendance.errorMonth')} subtitle="" onRetry={() => historyQuery.refetch()} />
              </View>
            )}
            {/* Legend inside card with top separator */}
            <View style={styles.legendSep} />
            <View style={styles.legendWrap}>
              <Legend items={legendItems} />
            </View>
          </View>

          {/* Request leave — slim outline entry point to the leave-filing screen
              (the comp omits this, but the route is otherwise unreachable). */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/(parent)/request-leave')}
            style={[styles.leaveBtn, { borderColor: c.primary }]}
          >
            <Ionicons name="add-circle-outline" size={18} color={c.primary} />
            <NpText style={[styles.leaveBtnText, { color: c.primary }]}>{t('attendance.requestLeave')}</NpText>
          </TouchableOpacity>

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
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flex: 1, minWidth: 0 },
  headerTitle: { fontFamily: FONT.extrabold, fontSize: 17 },
  headerSub: { fontFamily: FONT.semibold, fontSize: 11.5, marginTop: 2 },

  // Stat tiles in the header
  statRow: { flexDirection: 'row', gap: 7, marginTop: 12 },
  statTile: {
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 11,
    alignItems: 'center',
  },
  statNum: { fontFamily: FONT.extrabold, fontSize: 14 },
  statLabel: { fontFamily: FONT.bold, fontSize: 8.5, marginTop: 1 },

  // Percentage ring
  ringOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    flexShrink: 0,
  },
  ringInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPercent: { fontFamily: FONT.extrabold, fontSize: 19, lineHeight: 22 },
  ringLabel: { fontFamily: FONT.bold, fontSize: 8, marginTop: 1 },

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

  // Slim outline entry to the request-leave screen
  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  leaveBtnText: { fontFamily: FONT.bold, fontSize: 13 },

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
});
