import {
  View, Text, Image, ScrollView, TouchableOpacity, RefreshControl, StatusBar, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { router } from 'expo-router';

import { useMyProfile, useMyTimetable, useMyAttendanceSummary } from '../../hooks/useStudentMe';
import NpText from '../../components/NpText';
import Skeleton from '../../components/Skeleton';
import { AttendanceSummaryCard, TodayClasses, ErrorState, ScreenHeader, HeaderBell, type TodayPeriod } from '../../components/ui';
import { useAuthStore } from '../../store/auth';
import { useBranding } from '../../lib/theme/provider';
import { todayBs, formatBs } from 'bs-calendar';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

function getGreeting(): string {
  // Asia/Kathmandu is UTC+5:45 — read the Nepal wall-clock hour regardless of device TZ.
  const hour = new Date(Date.now() + 345 * 60 * 1000).getUTCHours();
  if (hour < 12) return 'Good morning 👋';
  if (hour < 17) return 'Good afternoon 👋';
  return 'Good evening 👋';
}

// "Gyan Jyoti Secondary School" -> { head: "Gyan Jyoti", tail: "Secondary School" }
function splitName(name: string): { head: string; tail: string } {
  const words = name.trim().split(/\s+/);
  if (words.length <= 2) return { head: name, tail: 'Student portal' };
  return { head: words.slice(0, 2).join(' '), tail: words.slice(2).join(' ') };
}

const QUICK = [
  { icon: 'calendar-number-outline', label: 'Attendance', route: '/(student)/attendance' },
  { icon: 'calendar-outline', label: 'Routine', route: '/(student)/timetable' },
  { icon: 'ribbon-outline', label: 'Results', route: '/(student)/results' },
  { icon: 'clipboard-outline', label: 'Assignments', route: '/(student)/assignments' },
  { icon: 'megaphone-outline', label: 'Notices', route: '/(student)/notices' },
  { icon: 'person-outline', label: 'Profile', route: '/(student)/profile' },
] as const;

export default function StudentDashboard() {
  const [refreshing, setRefreshing] = useState(false);
  const tenant = useAuthStore((s) => s.tenant);
  const { branding } = useBranding();
  const c = useThemeColors();

  const profile = useMyProfile();
  const timetable = useMyTimetable();
  const summary = useMyAttendanceSummary();

  const isLoading = profile.isLoading || timetable.isLoading || summary.isLoading;
  const isError = profile.isError || timetable.isError || summary.isError;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([profile.refetch(), timetable.refetch(), summary.refetch()]);
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
          title="Couldn't load your dashboard"
          onRetry={() => { void profile.refetch(); void timetable.refetch(); void summary.refetch(); }}
        />
      </View>
    );
  }

  const p = profile.data;
  const t = timetable.data;
  const s = summary.data;

  const fullName = p ? `${p.firstName} ${p.lastName}` : '';
  const studentInitials = p
    ? [p.firstName, p.lastName].filter(Boolean).map((n) => n[0]?.toUpperCase() ?? '').join('')
    : '';
  const enrollment = p?.currentEnrollment ?? null;
  let enrollmentLine = 'Not enrolled';
  if (enrollment) {
    const parts = [enrollment.className, `Section ${enrollment.sectionName}`];
    if (enrollment.rollNumber !== null) parts.push(`Roll ${enrollment.rollNumber}`);
    enrollmentLine = parts.join(' · ');
  }

  const schoolName = branding?.name ?? tenant?.name ?? 'Aaramva Shikshya';
  const { head, tail } = splitName(schoolName);
  const initials = head.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

  const todayPeriods: TodayPeriod[] = (t?.periods ?? []).map((period) => ({
    slotId: period.slotId,
    periodNumber: period.periodNumber,
    startTime: period.startTime,
    endTime: period.endTime,
    subjectName: period.subject.name,
    teacherName: period.teacher.fullName,
    room: period.room,
  }));

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
                <NpText numberOfLines={1} style={[styles.schoolTail, { color: c.brandMuted }]}>{tail}</NpText>
              </View>
            </View>
            <View style={styles.bandActions}>
              <HeaderBell inboxRoute="/(student)/inbox" />
              {studentInitials ? (
                <View style={[styles.avatarCircle, { backgroundColor: c.primary, borderColor: c.surface }]}>
                  <Text style={[styles.avatarText, { color: c.primaryForeground }]}>{studentInitials}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <Text style={[styles.todayBs, { color: c.brandMuted }]}>
            Today · {formatBs(todayBs(), 'en')}
          </Text>
          <Text style={[styles.greeting, { color: c.mutedForeground }]}>{getGreeting()}</Text>
          <NpText style={[styles.name, { color: c.foreground }]}>{fullName}</NpText>
          <Text style={[styles.enroll, { color: c.mutedForeground }]}>{enrollmentLine}</Text>
        </ScreenHeader>

        <View style={styles.body}>
          {s && (
            <AttendanceSummaryCard
              present={s.present}
              absent={s.absent}
              late={s.late}
              leave={s.leave}
              percent={s.attendancePercent}
              totalWorkingDays={s.totalWorkingDays}
            />
          )}

          {/* Quick access */}
          <Text style={[styles.sectionLabel, { color: c.foreground }]}>Quick access</Text>
          <View style={styles.quickGrid}>
            {QUICK.map((q) => (
              <TouchableOpacity
                key={q.label}
                style={[styles.quickTile, { backgroundColor: c.surface }]}
                activeOpacity={0.85}
                onPress={() => router.push(q.route)}
              >
                <View style={[styles.quickIcon, { backgroundColor: c.brandSurface }]}>
                  <Ionicons name={q.icon} size={23} color={c.primary} />
                </View>
                <Text style={[styles.quickLabel, { color: c.foreground }]}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Today's classes */}
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionLabel, { color: c.foreground, marginTop: 0 }]}>Today&apos;s classes</Text>
            <TouchableOpacity
              style={styles.routineLink}
              onPress={() => router.push('/(student)/timetable')}
              activeOpacity={0.7}
            >
              <Text style={[styles.routineLinkText, { color: c.primary }]}>Routine</Text>
              <Ionicons name="chevron-forward" size={15} color={c.primary} />
            </TouchableOpacity>
          </View>
          <TodayClasses
            periods={todayPeriods}
            isSchoolDay={t?.isSchoolDay ?? false}
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
  logoChip: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  logoChipText: { fontFamily: FONT.extrabold, fontSize: 12.5, letterSpacing: 0.5 },
  schoolHead: { fontFamily: FONT.extrabold, fontSize: 12.5, lineHeight: 15 },
  schoolTail: { fontFamily: FONT.medium, fontSize: 10, marginTop: 1 },
  todayBs: { fontFamily: FONT.bold, fontSize: 11.5, marginTop: 16, letterSpacing: 0.3 },
  greeting: { fontFamily: FONT.medium, fontSize: 13, marginTop: 6 },
  name: { fontFamily: FONT.extrabold, fontSize: 25, marginTop: 1, letterSpacing: -0.4 },
  enroll: { fontFamily: FONT.medium, fontSize: 12.5, marginTop: 3 },
  // Right side of band top: bell (HeaderBell, live unread count) + avatar
  bandActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  avatarText: { fontFamily: FONT.extrabold, fontSize: 14 },

  // Body
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  sectionLabel: { fontFamily: FONT.extrabold, fontSize: 12, marginTop: 20, marginBottom: 12, marginLeft: 2, letterSpacing: 0.2 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 12 },
  routineLink: { flexDirection: 'row', alignItems: 'center' },
  routineLinkText: { fontFamily: FONT.bold, fontSize: 11.5 },

  // Quick access — 3-column grid (matches comp). width≈30.3% so 3 tiles + 2 gaps of 10 fill the row.
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickTile: {
    width: '30.3%', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', gap: 8,
    shadowColor: '#10231A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 13, elevation: 2,
  },
  quickIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontFamily: FONT.bold, fontSize: 11, textAlign: 'center' },

  lastCard: { marginBottom: 8 },
});
