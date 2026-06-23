import { View, Text, Image, ScrollView, TouchableOpacity, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { todayBs, formatBs } from 'bs-calendar';

import { useMyChildren, useChildAttendanceSummary, useChildTimetable } from '../../hooks/useParentChild';
import { useAuthStore } from '../../store/auth';
import { useBranding } from '../../lib/theme/provider';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import {
  AttendanceSummaryCard, TodayClasses, EmptyState, ErrorState, LoadingBlock, type TodayPeriod,
} from '../../components/ui';
import NpText from '../../components/NpText';

const QUICK = [
  { icon: 'ribbon-outline', label: 'Results', route: '/(parent)/results' },
  { icon: 'calendar-number-outline', label: 'Attendance', route: '/(parent)/attendance' },
  { icon: 'megaphone-outline', label: 'Notices', route: '/(parent)/notices' },
  { icon: 'card-outline', label: 'Fees', route: '/(parent)/fees' },
] as const;

function splitName(name: string): { head: string; tail: string } {
  const words = name.trim().split(/\s+/);
  if (words.length <= 2) return { head: name, tail: 'Parent portal' };
  return { head: words.slice(0, 2).join(' '), tail: 'Parent portal' };
}

// "ramesh.shrestha@gmail.com" -> "Ramesh Shrestha" (same derivation as (parent)/profile.tsx)
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export default function ParentDashboard() {
  const [refreshing, setRefreshing] = useState(false);
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const tenant = useAuthStore((s) => s.tenant);
  const user = useAuthStore((s) => s.user);
  const { branding } = useBranding();
  const selectedChildId = useAuthStore((s) => s.selectedChildId);
  const setSelectedChildId = useAuthStore((s) => s.setSelectedChildId);

  const childrenQuery = useMyChildren();
  const children = childrenQuery.data ?? [];
  const effectiveChildId: string | null = selectedChildId ?? (children[0]?.id ?? null);

  useEffect(() => {
    if (!selectedChildId && effectiveChildId) setSelectedChildId(effectiveChildId);
  }, [selectedChildId, effectiveChildId, setSelectedChildId]);

  const selectedChild = children.find((ch) => ch.id === effectiveChildId) ?? null;
  const sectionId = selectedChild?.currentEnrollment?.sectionId ?? null;
  const academicYearId = selectedChild?.currentEnrollment?.academicYearId ?? null;

  const summaryQuery = useChildAttendanceSummary(effectiveChildId ?? '', academicYearId);
  const timetableQuery = useChildTimetable(sectionId);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([childrenQuery.refetch(), summaryQuery.refetch(), timetableQuery.refetch()]);
    setRefreshing(false);
  };

  if (childrenQuery.isLoading) {
    return <View style={[styles.fill, { backgroundColor: c.background }]}><LoadingBlock label="Loading…" /></View>;
  }
  if (childrenQuery.isError) {
    return (
      <View style={[styles.fill, { backgroundColor: c.background }]}>
        <ErrorState title="Couldn't load" onRetry={() => void childrenQuery.refetch()} />
      </View>
    );
  }
  if (children.length === 0) {
    return (
      <View style={[styles.fill, { backgroundColor: c.background, justifyContent: 'center' }]}>
        <EmptyState
          icon="people-outline"
          title="No children linked"
          subtitle="Ask your school to link your guardian account to your child's profile."
        />
      </View>
    );
  }

  const s = summaryQuery.data;
  const todayDow = new Date().getDay();
  const isSchoolDay = todayDow !== 6;
  const slots = timetableQuery.data ?? [];
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

  // Guardian avatar initials — derived from the login email (same pattern as (parent)/profile.tsx).
  const guardianEmail = user?.email ?? '';
  const guardianName = guardianEmail ? nameFromEmail(guardianEmail) : 'Parent';
  const guardianInitials = guardianName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {/* Hero band */}
        <View
          style={[
            styles.band,
            { paddingTop: insets.top + 12, backgroundColor: c.brandSurface, borderBottomColor: c.brandBorder },
          ]}
        >
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
              <TouchableOpacity
                onPress={() => router.push('/(parent)/notices')}
                hitSlop={10}
                accessibilityLabel="Notices"
                style={styles.bellWrap}
              >
                <Ionicons name="notifications-outline" size={22} color={c.primary} />
                <View style={[styles.badge, { backgroundColor: c.danger, borderColor: c.brandSurface }]} />
              </TouchableOpacity>
              {guardianInitials ? (
                <View style={[styles.avatarCircle, { backgroundColor: c.primary, borderColor: c.surface }]}>
                  <Text style={[styles.avatarText, { color: c.primaryForeground }]}>{guardianInitials}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <Text style={[styles.todayBs, { color: c.brandMuted }]}>Today · {formatBs(todayBs(), 'en')}</Text>
          <Text style={[styles.viewing, { color: c.mutedForeground }]}>Viewing child</Text>
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
        </View>

        <View style={styles.body}>
          {s ? (
            <AttendanceSummaryCard
              present={s.present}
              absent={s.absent}
              late={s.late}
              leave={s.leave}
              percent={s.attendancePercent}
              totalWorkingDays={s.totalWorkingDays}
            />
          ) : summaryQuery.isLoading ? (
            <LoadingBlock />
          ) : (
            <EmptyState compact icon="stats-chart-outline" title="Attendance data unavailable" />
          )}

          {/* Quick access (4 tiles) */}
          <Text style={[styles.sectionLabel, styles.sectionLabelFirst, { color: c.foreground }]}>Quick access</Text>
          <View style={styles.quickGrid}>
            {QUICK.map((q) => (
              <TouchableOpacity
                key={q.label}
                style={[styles.quickTile, { backgroundColor: c.surface }]}
                activeOpacity={0.85}
                onPress={() => router.push(q.route)}
              >
                <View style={[styles.quickIcon, { backgroundColor: c.brandSurface }]}>
                  <Ionicons name={q.icon} size={21} color={c.primary} />
                </View>
                <Text style={[styles.quickLabel, { color: c.foreground }]}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.sectionLabel, { color: c.foreground }]}>Today&apos;s classes</Text>
          <TodayClasses periods={todayPeriods} isSchoolDay={isSchoolDay} style={styles.lastCard} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },

  band: { paddingHorizontal: 20, paddingBottom: 18, borderBottomWidth: 1 },
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

  // Right side of band top: notification bell (with static badge dot) + guardian avatar.
  // Mirrors the student home treatment for cross-screen parity (comp lines 612–613).
  bandActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bellWrap: { position: 'relative' },
  badge: { position: 'absolute', top: -1, right: 0, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  avatarCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  avatarText: { fontFamily: FONT.extrabold, fontSize: 14 },

  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  sectionLabel: { fontFamily: FONT.extrabold, fontSize: 12, marginTop: 22, marginBottom: 12, marginLeft: 2 },
  // "Quick access" sits 20px below the card (comp: margin-top 20px), vs 22px for "Today's classes"
  sectionLabelFirst: { marginTop: 20 },

  quickGrid: { flexDirection: 'row', gap: 9 },
  quickTile: {
    flex: 1, borderRadius: 15, paddingVertical: 13, paddingHorizontal: 4, alignItems: 'center', gap: 7,
    shadowColor: '#10231A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 13, elevation: 2,
  },
  quickIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontFamily: FONT.bold, fontSize: 10, textAlign: 'center' },

  lastCard: { marginBottom: 8 },
});
