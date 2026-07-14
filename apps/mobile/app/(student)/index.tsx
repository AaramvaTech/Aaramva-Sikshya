import {
  View, ScrollView, TouchableOpacity, RefreshControl, StatusBar, StyleSheet,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';

import { useMyProfile, useMyTimetable, useMyAttendanceSummary, useNotices } from '../../hooks/useStudentMe';
import { useMyAssignments } from '../../hooks/useAssignments';
import NpText from '../../components/NpText';
import Skeleton from '../../components/Skeleton';
import {
  TodayClasses, TodayModule, ErrorState, ScreenHeader, HeaderBell, SectionLabel,
  SchoolBadge, AvatarBadge, FeatureTile, Icon, type TodayPeriod,
} from '../../components/ui';
import { useAuthStore } from '../../store/auth';
import { useBranding } from '../../lib/theme/provider';
import { todayBs, formatBs } from 'bs-calendar';
import { useThemeColors, SEMANTIC_SOFT } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import { useLocale, bsLang } from '../../hooks/useLocale';
import { nextPeriod } from '../../lib/nextPeriod';
import { todayAttendanceStatus } from '../../lib/todayStatus';
import type { TFunction } from 'i18next';

function greetingKey(): string {
  // Asia/Kathmandu is UTC+5:45 — read the Nepal wall-clock hour regardless of device TZ.
  const hour = new Date(Date.now() + 345 * 60 * 1000).getUTCHours();
  if (hour < 12) return 'dashboard.greetingMorning';
  if (hour < 17) return 'dashboard.greetingAfternoon';
  return 'dashboard.greetingEvening';
}

function enrollmentLine(
  t: TFunction,
  enrollment: { className: string; sectionName: string; rollNumber: number | null } | null,
): string {
  if (!enrollment) return t('dashboard.notEnrolled');
  const parts = [enrollment.className, t('dashboard.section', { name: enrollment.sectionName })];
  if (enrollment.rollNumber !== null) parts.push(t('dashboard.roll', { number: enrollment.rollNumber }));
  return parts.join(' · ');
}

const QUICK_KEYS: Record<string, string> = {
  Attendance: 'quick.attendance',
  Routine: 'quick.routine',
  Results: 'quick.results',
  Assignments: 'quick.assignments',
  Notices: 'quick.notices',
  Profile: 'quick.profile',
};

// "Gyan Jyoti Secondary School" -> { head: "Gyan Jyoti", tail: "Secondary School" }
function splitName(name: string): { head: string; tail: string } {
  const words = name.trim().split(/\s+/);
  if (words.length <= 2) return { head: name, tail: 'Student portal' };
  return { head: words.slice(0, 2).join(' '), tail: words.slice(2).join(' ') };
}

// Per-tile semantic tints (SEMANTIC_SOFT) — documented literal exception, not brand-coupled.
const QUICK = [
  { icon: 'how_to_reg', label: 'Attendance', route: '/(student)/attendance', tint: 'success' },
  { icon: 'calendar_month', label: 'Routine', route: '/(student)/timetable', tint: 'info' },
  { icon: 'grade', label: 'Results', route: '/(student)/results', tint: 'warning' },
  { icon: 'assignment', label: 'Assignments', route: '/(student)/assignments', tint: 'info' },
  { icon: 'campaign', label: 'Notices', route: '/(student)/notices', tint: 'danger' },
  { icon: 'person', label: 'Profile', route: '/(student)/profile', tint: 'neutral' },
] as const;

export default function StudentDashboard() {
  const [refreshing, setRefreshing] = useState(false);
  const tenant = useAuthStore((s) => s.tenant);
  const { branding } = useBranding();
  const c = useThemeColors();
  const { t, locale } = useLocale('student');

  const profile = useMyProfile();
  const timetable = useMyTimetable();
  const summary = useMyAttendanceSummary();
  // Supplementary counts for the Today module's homework/notice buttons — kept
  // OUT of the isLoading/isError gate below (they're navigation aids, not
  // blocking content; see task report for rationale).
  const assignments = useMyAssignments();
  const notices = useNotices();

  const isLoading = profile.isLoading || timetable.isLoading || summary.isLoading;
  const isError = profile.isError || timetable.isError || summary.isError;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      profile.refetch(), timetable.refetch(), summary.refetch(),
      assignments.refetch(), notices.refetch(),
    ]);
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <Skeleton style={{ height: 200 }} className="rounded-none" />
        <View style={{ paddingHorizontal: 16, marginTop: 16, gap: 12 }}>
          <Skeleton style={{ height: 150 }} className="rounded-2xl" />
          <Skeleton style={{ height: 180 }} className="rounded-2xl" />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.centerFill, { backgroundColor: c.background }]}>
        <ErrorState
          title={t('dashboard.errorTitle')}
          onRetry={() => { void profile.refetch(); void timetable.refetch(); void summary.refetch(); }}
        />
      </View>
    );
  }

  const p = profile.data;
  const tt = timetable.data;
  const s = summary.data;

  const fullName = p ? `${p.firstName} ${p.lastName}` : '';
  const studentInitials = p
    ? [p.firstName, p.lastName].filter(Boolean).map((n) => n[0]?.toUpperCase() ?? '').join('')
    : '';
  const enrollment = p?.currentEnrollment ?? null;
  const enrollLine = enrollmentLine(t, enrollment);

  const schoolName = branding?.name ?? tenant?.name ?? 'Aaramva Shikshya';
  const { head, tail } = splitName(schoolName);

  const todayPeriods: TodayPeriod[] = (tt?.periods ?? []).map((period) => ({
    slotId: period.slotId,
    periodNumber: period.periodNumber,
    startTime: period.startTime,
    endTime: period.endTime,
    subjectName: period.subject.name,
    teacherName: period.teacher.fullName,
    room: period.room,
  }));

  // Today module data — Nepal wall-clock "now" (UTC+5:45), TZ-independent.
  const nepalNow = new Date(Date.now() + 345 * 60 * 1000);
  const nowMin = nepalNow.getUTCHours() * 60 + nepalNow.getUTCMinutes();
  const next = tt ? nextPeriod(tt.periods, nowMin) : null;

  const todayAd = nepalNow.toISOString().split('T')[0];
  const attendanceStatus = s ? todayAttendanceStatus(s.recentHistory, todayAd) : null;

  const homeworkCount = assignments.data?.filter((a) => !a.mySubmission).length ?? 0;
  const noticeCount = notices.data?.length ?? 0;

  const todayBsLabel = formatBs(todayBs(), bsLang(locale));

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {/* Hero band */}
        <ScreenHeader variant="hero" bare padTop={12} padBottom={20}>
          <View style={styles.bandTop}>
            <View style={styles.schoolWrap}>
              <SchoolBadge name={schoolName} logoUrl={branding?.logoUrl} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <NpText numberOfLines={1} style={[styles.schoolHead, { color: c.foreground }]}>{head}</NpText>
                <NpText numberOfLines={1} style={[styles.schoolTail, { color: c.brandMuted }]}>{tail}</NpText>
              </View>
            </View>
            <View style={styles.bandActions}>
              <HeaderBell inboxRoute="/(student)/inbox" />
              {studentInitials ? <AvatarBadge initials={studentInitials} size={38} ring /> : null}
            </View>
          </View>

          <NpText style={[styles.todayBs, { color: c.brandMuted }]}>
            {t('common:common.today')} · {todayBsLabel}
          </NpText>
          <NpText style={[styles.greeting, { color: c.mutedForeground }]}>{t(greetingKey())}</NpText>
          <NpText style={[styles.name, { color: c.foreground }]}>{fullName}</NpText>
          <NpText style={[styles.enroll, { color: c.mutedForeground }]}>{enrollLine}</NpText>
        </ScreenHeader>

        <View style={styles.body}>
          <TodayModule
            status={attendanceStatus}
            next={next}
            homeworkCount={homeworkCount}
            noticeCount={noticeCount}
            todayBsLabel={todayBsLabel}
            onNext={() => router.push('/(student)/timetable')}
            onHomework={() => router.push('/(student)/assignments')}
            onNotices={() => router.push('/(student)/notices')}
          />

          {/* Quick access */}
          <SectionLabel style={styles.sectionLabel}>{t('dashboard.quickAccess')}</SectionLabel>
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

          {/* Today's classes */}
          <View style={styles.sectionRow}>
            <SectionLabel style={[styles.sectionLabel, styles.sectionLabelFlat]}>{t('dashboard.todaysClasses')}</SectionLabel>
            <TouchableOpacity
              style={styles.routineLink}
              onPress={() => router.push('/(student)/timetable')}
              activeOpacity={0.7}
            >
              <NpText style={[styles.routineLinkText, { color: c.primary }]}>{t('dashboard.routine')}</NpText>
              <Icon name="chevron_right" size={15} color={c.primary} />
            </TouchableOpacity>
          </View>
          <TodayClasses
            periods={todayPeriods}
            isSchoolDay={tt?.isSchoolDay ?? false}
            style={styles.lastCard}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  // Hero band
  bandTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  schoolWrap: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 },
  schoolHead: { fontFamily: FONT.extrabold, fontSize: 12.5, lineHeight: 15 },
  schoolTail: { fontFamily: FONT.medium, fontSize: 10, marginTop: 1 },
  todayBs: { fontFamily: FONT.bold, fontSize: 11.5, marginTop: 16, letterSpacing: 0.3 },
  greeting: { fontFamily: FONT.medium, fontSize: 13, marginTop: 6 },
  name: { fontFamily: FONT.extrabold, fontSize: 25, marginTop: 1, letterSpacing: -0.4 },
  enroll: { fontFamily: FONT.medium, fontSize: 12.5, marginTop: 3 },
  // Right side of band top: bell (HeaderBell, live unread count) + avatar
  bandActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  // Body
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  sectionLabel: { marginTop: 20, marginBottom: 12, marginLeft: 2 },
  sectionLabelFlat: { marginTop: 0 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 12 },
  routineLink: { flexDirection: 'row', alignItems: 'center' },
  routineLinkText: { fontFamily: FONT.bold, fontSize: 11.5 },

  // Quick access — 3-column grid (matches comp). width≈30.3% so 3 tiles + 2 gaps of 10 fill the row.
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  lastCard: { marginBottom: 8 },
});
