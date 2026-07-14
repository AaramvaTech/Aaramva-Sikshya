import { View, Text, Image, ScrollView, TouchableOpacity, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { todayBs, formatBs } from 'bs-calendar';
import { useLocale, bsLang } from '../../hooks/useLocale';

import { useMyChildren, useChildAttendanceSummary, useChildLedger, useChildTimetable, useGuardianProfile } from '../../hooks/useParentChild';
import { guardianDisplayName, guardianInitials } from '../../lib/guardian';
import { todayAttendanceStatus } from '../../lib/todayStatus';
import { useAuthStore } from '../../store/auth';
import { useBranding } from '../../lib/theme/provider';
import { useThemeColors, SEMANTIC_SOFT } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import {
  Card, SectionLabel, FeatureTile, TodayClasses, EmptyState, ErrorState, ScreenHeader, HeaderBell, Icon,
  type TodayPeriod, type IconName,
} from '../../components/ui';
import NpText from '../../components/NpText';
import Skeleton from '../../components/Skeleton';

// Same "NPR 1,234" formatting as the fees screen (app/(parent)/fees.tsx) —
// a 2-site literal, not worth extracting to a shared util yet.
const formatNPR = (amount: number) => `NPR ${amount.toLocaleString('en-IN')}`;

// Today card status row — mirrors app/(student)/index.tsx's TodayModule STATUS_META
// (same statuses, same tones/icons); kept local since the parent Today card is a
// bespoke composition, not the student-locked TodayModule component.
const STATUS_META: Record<string, { tone: keyof typeof SEMANTIC_SOFT; icon: IconName; labelKey: string }> = {
  PRESENT: { tone: 'success', icon: 'check_circle', labelKey: 'today.markedPresent' },
  ABSENT: { tone: 'danger', icon: 'check_circle', labelKey: 'today.markedAbsent' },
  LATE: { tone: 'warning', icon: 'schedule', labelKey: 'today.markedLate' },
  LEAVE: { tone: 'info', icon: 'event', labelKey: 'today.markedLeave' },
};

// Material icon names (see lib/icons/names.ts) — mirrors the equivalent tiles
// on the student dashboard (grade/how_to_reg/campaign/assignment) so the same
// concept always reads as the same glyph across roles; 'payments' for Fees is
// parent-only (no student equivalent). Per-tile semantic tints (SEMANTIC_SOFT) —
// documented literal exception, not brand-coupled (see student QUICK for precedent).
const QUICK = [
  { icon: 'grade', label: 'Results', route: '/(parent)/results', tint: 'warning' },
  { icon: 'how_to_reg', label: 'Attendance', route: '/(parent)/attendance', tint: 'success' },
  { icon: 'campaign', label: 'Notices', route: '/(parent)/notices', tint: 'neutral' },
  { icon: 'payments', label: 'Fees', route: '/(parent)/fees', tint: 'danger' },
  { icon: 'assignment', label: 'Homework', route: '/(parent)/assignments', tint: 'info' },
] as const;

const QUICK_KEYS: Record<string, string> = {
  Results: 'quick.results', Attendance: 'quick.attendance', Notices: 'quick.notices', Fees: 'quick.fees', Homework: 'quick.homework',
};

function splitName(name: string): { head: string; tail: string } {
  const words = name.trim().split(/\s+/);
  if (words.length <= 2) return { head: name, tail: 'Parent portal' };
  return { head: words.slice(0, 2).join(' '), tail: 'Parent portal' };
}

export default function ParentDashboard() {
  const [refreshing, setRefreshing] = useState(false);
  const c = useThemeColors();
  const { t, locale } = useLocale('parent');
  const tenant = useAuthStore((s) => s.tenant);
  const user = useAuthStore((s) => s.user);
  const { branding } = useBranding();
  const selectedChildId = useAuthStore((s) => s.selectedChildId);
  const setSelectedChildId = useAuthStore((s) => s.setSelectedChildId);

  const childrenQuery = useMyChildren();
  const children = childrenQuery.data ?? [];
  const { data: guardian } = useGuardianProfile();
  const effectiveChildId: string | null = selectedChildId ?? (children[0]?.id ?? null);

  useEffect(() => {
    if (!selectedChildId && effectiveChildId) setSelectedChildId(effectiveChildId);
  }, [selectedChildId, effectiveChildId, setSelectedChildId]);

  const selectedChild = children.find((ch) => ch.id === effectiveChildId) ?? null;
  const sectionId = selectedChild?.currentEnrollment?.sectionId ?? null;
  const academicYearId = selectedChild?.currentEnrollment?.academicYearId ?? null;

  const summaryQuery = useChildAttendanceSummary(effectiveChildId ?? '', academicYearId);
  const timetableQuery = useChildTimetable(sectionId);
  const ledgerQuery = useChildLedger(effectiveChildId ?? '', academicYearId);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      childrenQuery.refetch(), summaryQuery.refetch(), timetableQuery.refetch(), ledgerQuery.refetch(),
    ]);
    setRefreshing(false);
  };

  if (childrenQuery.isLoading) {
    return (
      <View style={[styles.fill, { backgroundColor: c.background }]}>
        <StatusBar barStyle="dark-content" />
        <Skeleton style={{ height: 220 }} className="rounded-none" />
        <View style={{ paddingHorizontal: 16, marginTop: 16, gap: 12 }}>
          <Skeleton style={{ height: 110 }} className="rounded-2xl" />
          <Skeleton style={{ height: 64 }} className="rounded-2xl" />
          <Skeleton style={{ height: 150 }} className="rounded-2xl" />
        </View>
      </View>
    );
  }
  if (childrenQuery.isError) {
    return (
      <View style={[styles.fill, { backgroundColor: c.background }]}>
        <ErrorState title={t('dashboard.errorTitle')} onRetry={() => void childrenQuery.refetch()} />
      </View>
    );
  }
  if (children.length === 0) {
    return (
      <View style={[styles.fill, { backgroundColor: c.background, justifyContent: 'center' }]}>
        <EmptyState
          icon="people-outline"
          title={t('dashboard.noChildrenTitle')}
          subtitle={t('dashboard.noChildrenSubtitle')}
        />
      </View>
    );
  }

  const s = summaryQuery.data;
  const todayDow = new Date().getDay();
  const isSchoolDay = todayDow !== 6;
  const slots = timetableQuery.data ?? [];

  // Today module data — Nepal wall-clock "today" (UTC+5:45), TZ-independent
  // (matches app/(student)/index.tsx's identical pattern).
  const nepalNow = new Date(Date.now() + 345 * 60 * 1000);
  const todayAd = nepalNow.toISOString().split('T')[0];
  // The child-summary endpoint returns recentHistory as { ad, bs, status } (attendance.entity.ts
  // StudentSummaryDto) — different field name than the student /me summary's { dateAd, status } —
  // so adapt the shape before handing it to the shared todayAttendanceStatus helper.
  const attendanceStatus = s
    ? todayAttendanceStatus(
        (s.recentHistory ?? []).map((h) => ({ dateAd: h.ad, status: h.status })),
        todayAd,
      )
    : null;
  // Distinguish a failed/empty summary fetch from a genuine "not yet marked":
  // if the summary query isn't loading and produced no data (error or no rows),
  // the status row shows a neutral "unavailable" treatment (preserving the old
  // AttendanceSummaryCard's error/empty branch) rather than misreporting the
  // failure as PRESENT/not-marked.
  const summaryUnavailable = !summaryQuery.isLoading && !s;
  const statusMeta = attendanceStatus ? STATUS_META[attendanceStatus] : undefined;
  const statusTone: keyof typeof SEMANTIC_SOFT = statusMeta?.tone ?? 'neutral';
  const statusSoft = SEMANTIC_SOFT[statusTone];
  const statusIcon: IconName = summaryUnavailable ? 'error' : (statusMeta?.icon ?? 'check_circle');
  const statusLabel = summaryUnavailable
    ? t('dashboard.attendanceUnavailable')
    : statusMeta
      ? t(statusMeta.labelKey)
      : t('today.notMarked');

  const outstanding = ledgerQuery.data?.summary.totalBalance ?? 0;
  const todayBsLabel = formatBs(todayBs(), bsLang(locale));
  const todayPeriods: TodayPeriod[] = slots
    .filter((slot) => slot.dayOfWeek === todayDow)
    .sort((a, b) => a.periodNumber - b.periodNumber)
    .map((slot) => ({
      slotId: slot.slotId,
      periodNumber: slot.periodNumber,
      startTime: slot.startTime,
      endTime: slot.endTime,
      subjectName: slot.subject.name,
      teacherName: slot.teacher.fullName,
      room: slot.room,
    }));

  const childName = selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : '';
  const enroll = selectedChild?.currentEnrollment;
  const enrollmentLine = enroll
    ? `Class ${enroll.className} · Section ${enroll.sectionName}${enroll.rollNumber != null ? ` · Roll ${enroll.rollNumber}` : ''}`
    : 'Not enrolled';

  const schoolName = branding?.name ?? tenant?.name ?? 'Aaramva Shikshya';
  const { head, tail } = splitName(schoolName);
  const initials = head.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

  // Guardian avatar initials — real name from GET /guardians/me (POL-2 T5),
  // falling back to the login email only while that profile loads.
  const guardianName = guardianDisplayName(guardian, guardian?.email ?? user?.email ?? '');
  const guardianAvatarInitials = guardianInitials(guardianName);

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {/* Hero band */}
        <ScreenHeader variant="hero" bare padTop={12} padBottom={18}>
          <View style={styles.bandTop}>
            <View style={styles.schoolWrap}>
              {branding?.logoUrl ? (
                <View style={[styles.logoChip, { backgroundColor: c.surface }]}>
                  <Image source={{ uri: branding.logoUrl }} style={{ width: 24, height: 24 }} resizeMode="contain" />
                </View>
              ) : (
                <View style={[styles.logoChip, { backgroundColor: c.primary }]}>
                  <Text style={[styles.logoChipText, { color: c.primaryForeground }]}>{initials}</Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <NpText numberOfLines={1} style={[styles.schoolHead, { color: c.foreground }]}>{head}</NpText>
                <Text numberOfLines={1} style={[styles.schoolTail, { color: c.brandMuted }]}>{tail}</Text>
              </View>
            </View>
            <View style={styles.bandActions}>
              <HeaderBell inboxRoute="/(parent)/inbox" />
              {guardianAvatarInitials ? (
                <View style={[styles.avatarCircle, { backgroundColor: c.primary, borderColor: c.surface }]}>
                  <Text style={[styles.avatarText, { color: c.primaryForeground }]}>{guardianAvatarInitials}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <NpText style={[styles.todayBs, { color: c.brandMuted }]}>{t('common:common.today')} · {todayBsLabel}</NpText>
          <NpText style={[styles.viewing, { color: c.mutedForeground }]}>{t('dashboard.viewingChild')}</NpText>
          <NpText style={[styles.name, { color: c.foreground }]}>{childName}</NpText>
          <Text style={[styles.enroll, { color: c.mutedForeground }]}>{enrollmentLine}</Text>

          {children.length > 1 && (
            <View style={styles.chips}>
              {children.map((ch) => {
                const active = ch.id === effectiveChildId;
                return (
                  <TouchableOpacity
                    key={ch.id}
                    onPress={() => setSelectedChildId(ch.id)}
                    activeOpacity={0.85}
                    style={[
                      styles.chip,
                      active
                        ? { backgroundColor: c.primary, borderColor: c.primary }
                        : { backgroundColor: c.surface, borderColor: c.brandBorder },
                    ]}
                  >
                    <NpText style={[styles.chipText, { color: active ? c.primaryForeground : c.brandMuted }]}>
                      {ch.firstName}
                    </NpText>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScreenHeader>

        <View style={styles.body}>
          {/* Today card — replaces the old full AttendanceSummaryCard on Home (same
              rationale as the student TodayModule: a compact present/absent status
              row + an optional fee-due prompt). The full breakdown (calendar, stat
              tiles, recent activity) still lives untouched on the Attendance tab,
              reading the same summaryQuery/historyQuery data. */}
          {summaryQuery.isLoading ? (
            <Skeleton style={{ height: 170 }} className="rounded-2xl" />
          ) : (
            <Card elevated style={styles.todayCard}>
              <View style={styles.todayHeadRow}>
                <SectionLabel>{t('today.title')}</SectionLabel>
                <View style={[styles.todayPill, { backgroundColor: c.brandSurface }]}>
                  <NpText style={[styles.todayPillText, { color: c.primary }]}>{todayBsLabel}</NpText>
                </View>
              </View>

              <View style={[styles.todayRow, { backgroundColor: statusSoft.bg }]}>
                <Icon name={statusIcon} fill={attendanceStatus === 'PRESENT'} size={22} color={statusSoft.fg} />
                <NpText style={[styles.todayRowTitle, { color: statusSoft.fgDeep }]}>{statusLabel}</NpText>
              </View>

              {outstanding > 0 && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => router.push('/(parent)/fees')}
                  style={[styles.todayRow, { backgroundColor: SEMANTIC_SOFT.warning.bg }]}
                >
                  <View style={[styles.todayIconChip, { backgroundColor: c.surface }]}>
                    <Icon name="payments" size={19} color={SEMANTIC_SOFT.warning.fg} />
                  </View>
                  <View style={styles.todayRowInfo}>
                    <NpText style={[styles.todayRowTitle, { color: SEMANTIC_SOFT.warning.fgDeep }]}>{t('today.feeDue')}</NpText>
                    <NpText style={[styles.todayRowSub, { color: c.mutedForeground }]} numberOfLines={1}>
                      {t('today.feeOutstanding', { amount: formatNPR(outstanding) })}
                    </NpText>
                  </View>
                  <View style={[styles.payChip, { backgroundColor: SEMANTIC_SOFT.warning.fg }]}>
                    <NpText style={[styles.payChipText, { color: c.primaryForeground }]}>{t('today.pay')}</NpText>
                  </View>
                </TouchableOpacity>
              )}
            </Card>
          )}

          {/* Quick access */}
          <NpText style={[styles.sectionLabel, styles.sectionLabelFirst, { color: c.foreground }]}>{t('dashboard.quickAccess')}</NpText>
          <View style={styles.quickGrid}>
            {QUICK.map((q) => (
              <FeatureTile
                key={q.label}
                icon={q.icon}
                label={t(QUICK_KEYS[q.label] ?? q.label)}
                tint={{ bg: SEMANTIC_SOFT[q.tint].bg, fg: SEMANTIC_SOFT[q.tint].fg }}
                onPress={() => router.push(q.route)}
              />
            ))}
          </View>

          <View style={styles.sectionHeaderRow}>
            <NpText style={[styles.sectionLabel, styles.sectionLabelInline, { color: c.foreground }]}>{t('dashboard.todaysClasses')}</NpText>
            <TouchableOpacity
              onPress={() => router.push('/(parent)/timetable')}
              activeOpacity={0.7}
              style={styles.fullRoutineLink}
              accessibilityRole="button"
            >
              <NpText style={[styles.fullRoutineText, { color: c.primary }]}>{t('dashboard.fullRoutine')}</NpText>
              <Icon name="chevron_right" size={13} color={c.primary} />
            </TouchableOpacity>
          </View>
          <TodayClasses periods={todayPeriods} isSchoolDay={isSchoolDay} style={styles.lastCard} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },

  bandTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  schoolWrap: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 },
  logoChip: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  logoChipText: { fontFamily: FONT.extrabold, fontSize: 12.5, letterSpacing: 0.5 },
  schoolHead: { fontFamily: FONT.extrabold, fontSize: 12.5, lineHeight: 15 },
  schoolTail: { fontFamily: FONT.medium, fontSize: 10, marginTop: 1 },
  todayBs: { fontFamily: FONT.bold, fontSize: 11.5, marginTop: 16, letterSpacing: 0.3 },
  viewing: { fontFamily: FONT.medium, fontSize: 13, marginTop: 6 },
  name: { fontFamily: FONT.extrabold, fontSize: 24, marginTop: 1, letterSpacing: -0.4 },
  enroll: { fontFamily: FONT.medium, fontSize: 12.5, marginTop: 3 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 11, borderWidth: 1.5 },
  chipText: { fontFamily: FONT.bold, fontSize: 12 },

  // Right side of band top: notification bell (HeaderBell, live unread count) + guardian avatar.
  // Mirrors the student home treatment for cross-screen parity (comp lines 612–613).
  bandActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  avatarText: { fontFamily: FONT.extrabold, fontSize: 14 },

  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  sectionLabel: { fontFamily: FONT.extrabold, fontSize: 12, marginTop: 22, marginBottom: 12, marginLeft: 2 },
  // "Quick access" sits 20px below the card (comp: margin-top 20px), vs 22px for "Today's classes"
  sectionLabelFirst: { marginTop: 20 },
  // Today's classes header row: label on the left, "Full routine →" link on the right (T1 entry point)
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabelInline: { marginBottom: 12 },
  fullRoutineLink: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 22, marginBottom: 12 },
  fullRoutineText: { fontFamily: FONT.bold, fontSize: 12 },

  // Quick access — 3-column FeatureTile grid (width≈30.3%, wraps to a 3+2 row
  // for 5 tiles), matching app/(student)/index.tsx's grid.
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  lastCard: { marginBottom: 8 },

  // Today card — mirrors components/ui/TodayModule.tsx's row language (icon chip +
  // title/sub + tinted background) so both roles' "Today" concept reads identically.
  todayCard: { borderRadius: 20 },
  todayHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  todayPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  todayPillText: { fontFamily: FONT.bold, fontSize: 10.5 },
  todayRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 14, padding: 11, marginBottom: 9 },
  todayIconChip: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  todayRowInfo: { flex: 1, minWidth: 0 },
  todayRowTitle: { fontFamily: FONT.bold, fontSize: 13 },
  todayRowSub: { fontFamily: FONT.medium, fontSize: 11.5, marginTop: 2 },
  payChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  payChipText: { fontFamily: FONT.extrabold, fontSize: 11 },
});
