import { View, Text, Image, ScrollView, TouchableOpacity, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { todayBs, formatBs } from 'bs-calendar';

import { useMyStaffProfile, useMyTimetable, useMySections } from '../../hooks/useTeacher';
import { useAuthStore } from '../../store/auth';
import { useBranding } from '../../lib/theme/provider';
import { useThemeColors, headerGradient } from '../../lib/theme/colors';
import { subjectColor } from '../../lib/subjects';
import { formatPeriodTime } from '../../lib/time';
import { FONT } from '../../lib/theme/fonts';
import { EmptyState, ErrorState, ScreenHeader, HeaderBell } from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';
import NpText from '../../components/NpText';
import Skeleton from '../../components/Skeleton';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function nepalNow(): Date {
  const offset = 5 * 60 + 45;
  const now = new Date();
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + offset * 60000);
}
function todayDowNepal(): number { return nepalNow().getDay(); }
function getGreeting(): string {
  const hour = nepalNow().getHours();
  if (hour < 12) return 'Good morning 👋';
  if (hour < 17) return 'Good afternoon 👋';
  return 'Good evening 👋';
}
function splitName(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.length <= 2 ? name : words.slice(0, 2).join(' ');
}

export default function TeacherHome() {
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const c = useThemeColors();
  const tenant = useAuthStore((s) => s.tenant);
  const { branding } = useBranding();

  const profileResult = useMyStaffProfile();
  const timetableResult = useMyTimetable();
  const sectionsResult = useMySections();

  const todayDow = todayDowNepal();
  const isSaturday = todayDow === 6;

  const todaySlots = useMemo(() => timetableResult.data?.schedule[todayDow] ?? [], [timetableResult.data, todayDow]);
  const weeklyTotal = useMemo(() => {
    const sch = timetableResult.data?.schedule ?? {};
    return Object.values(sch).reduce((sum, arr) => sum + (arr?.length ?? 0), 0);
  }, [timetableResult.data]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([profileResult.refetch(), timetableResult.refetch(), sectionsResult.refetch()]);
    setRefreshing(false);
  };

  const p = profileResult.data;
  const teacherName = p ? `${p.firstName} ${p.lastName}` : '…';
  const desig = p?.designationTitle ?? p?.role ?? 'Teacher';
  const schoolName = branding?.name ?? tenant?.name ?? 'Aaramva Shikshya';
  const schoolHead = splitName(schoolName);
  const initials = schoolHead.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

  const stats = [
    { num: sectionsResult.data?.length ?? 0, label: 'Classes', color: c.primary },
    { num: todaySlots.length, label: 'Today', color: c.info },
    { num: weeklyTotal, label: 'Weekly', color: c.warning },
  ];

  // Identity + stats come from profile/sections; gate the initial screen on those.
  const initialLoading = profileResult.isLoading || sectionsResult.isLoading;
  const anyError = profileResult.isError || sectionsResult.isError || timetableResult.isError;
  const retryAll = () => {
    void profileResult.refetch(); void sectionsResult.refetch(); void timetableResult.refetch();
  };

  if (initialLoading) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <StatusBar barStyle="dark-content" />
        <Skeleton style={{ height: 200 }} className="rounded-none" />
        <View style={{ paddingHorizontal: 16, marginTop: 16, gap: 12 }}>
          <Skeleton style={{ height: 70 }} className="rounded-2xl" />
          <Skeleton style={{ height: 56 }} className="rounded-2xl" />
          <Skeleton style={{ height: 160 }} className="rounded-2xl" />
        </View>
      </View>
    );
  }
  if (anyError) {
    return (
      <View style={[styles.root, { backgroundColor: c.background, justifyContent: 'center' }]}>
        <StatusBar barStyle="dark-content" />
        <ErrorState title="Couldn't load your dashboard" onRetry={retryAll} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
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
                <NpText numberOfLines={1} style={[styles.schoolHead, { color: c.foreground }]}>{schoolHead}</NpText>
                <Text style={[styles.schoolTail, { color: c.brandMuted }]}>Teacher portal</Text>
              </View>
            </View>
            <HeaderBell inboxRoute="/(teacher)/inbox" />
          </View>

          <Text style={[styles.greeting, { color: c.brandMuted }]}>{getGreeting()}</Text>
          <NpText style={[styles.name, { color: c.foreground }]}>{teacherName}</NpText>
          <Text style={[styles.desig, { color: c.mutedForeground }]}>{desig} · {formatBs(todayBs(), 'en')}</Text>
        </ScreenHeader>

        <View style={styles.body}>
          {/* Stat cards */}
          <View style={styles.statRow}>
            {stats.map((s) => (
              <View key={s.label} style={[styles.statCard, CARD_SHADOW, { backgroundColor: c.surface }]}>
                <Text style={[styles.statNum, { color: s.color }]}>{s.num}</Text>
                <Text style={[styles.statLabel, { color: c.mutedForeground }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.actionBtn, { shadowColor: c.primary }]} activeOpacity={0.9} onPress={() => router.push('/(teacher)/attendance')}>
              <LinearGradient
                colors={[headerGradient(c.primary)[1], headerGradient(c.primary)[2]]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.actionFill}
              >
                <Ionicons name="checkbox-outline" size={23} color="#fff" />
                <Text style={styles.actionTextSolid}>Mark Attendance</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionSoft, { backgroundColor: c.brandSurface }]}
              activeOpacity={0.85}
              onPress={() => router.push('/(teacher)/marks')}
            >
              <Ionicons name="create-outline" size={23} color={c.primary} />
              <Text style={[styles.actionTextSoft, { color: c.primary }]}>Enter Marks</Text>
            </TouchableOpacity>
          </View>

          {/* Today's classes */}
          <Text style={[styles.sectionLabel, { color: c.foreground }]}>Today&apos;s classes</Text>
          {timetableResult.isLoading ? (
            <View style={[styles.classCard, CARD_SHADOW, { backgroundColor: c.surface, paddingVertical: 14, gap: 10 }]}>
              {[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 42 }} className="rounded-xl" />)}
            </View>
          ) : isSaturday || todaySlots.length === 0 ? (
            <View style={[styles.classCard, CARD_SHADOW, { backgroundColor: c.surface, paddingVertical: 24 }]}>
              <EmptyState
                compact
                icon={isSaturday ? 'sunny-outline' : 'calendar-clear-outline'}
                title={isSaturday ? 'Saturday — rest day' : 'No classes today'}
              />
            </View>
          ) : (
            <View style={[styles.classCard, CARD_SHADOW, { backgroundColor: c.surface }]}>
              {todaySlots.map((slot, idx) => {
                const sc = subjectColor(idx);
                const last = idx === todaySlots.length - 1;
                return (
                  <TouchableOpacity
                    key={slot.slotId}
                    activeOpacity={0.7}
                    onPress={() => router.push('/(teacher)/attendance')}
                    style={[styles.classRow, !last && { borderBottomWidth: 1, borderBottomColor: c.border }]}
                  >
                    <View style={[styles.pBadge, { backgroundColor: sc.bg }]}>
                      <Text style={[styles.pBadgeNum, { color: sc.text }]}>P{slot.periodNumber}</Text>
                      <Text style={[styles.pBadgeTime, { color: sc.text }]}>{formatPeriodTime(slot.startTime)}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <NpText style={[styles.classSubject, { color: c.foreground }]}>{slot.subject.name}</NpText>
                      <Text style={[styles.classMeta, { color: c.mutedForeground }]}>
                        {slot.className} · {slot.section}{slot.room ? ` · ${slot.room}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={c.border} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          <View style={{ height: 8 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  bandTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  schoolWrap: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 },
  logoChip: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  logoChipText: { fontFamily: FONT.extrabold, fontSize: 12.5, letterSpacing: 0.5 },
  schoolHead: { fontFamily: FONT.extrabold, fontSize: 12.5, lineHeight: 15 },
  schoolTail: { fontFamily: FONT.medium, fontSize: 10, marginTop: 1 },
  greeting: { fontFamily: FONT.bold, fontSize: 11.5, marginTop: 16, letterSpacing: 0.3 },
  name: { fontFamily: FONT.extrabold, fontSize: 24, marginTop: 3, letterSpacing: -0.4 },
  desig: { fontFamily: FONT.medium, fontSize: 12.5, marginTop: 3 },

  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  statRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, borderRadius: 15, paddingVertical: 14, alignItems: 'center' },
  statNum: { fontFamily: FONT.extrabold, fontSize: 22 },
  statLabel: { fontFamily: FONT.bold, fontSize: 9.5, textTransform: 'uppercase', marginTop: 2 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: { flex: 1, borderRadius: 15, overflow: 'hidden' },
  actionFill: { paddingVertical: 14, alignItems: 'center', gap: 5,
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 14, elevation: 5 },
  actionSoft: { paddingVertical: 14, alignItems: 'center', gap: 5 },
  actionTextSolid: { fontFamily: FONT.bold, fontSize: 12, color: '#fff' },
  actionTextSoft: { fontFamily: FONT.bold, fontSize: 12 },

  sectionLabel: { fontFamily: FONT.extrabold, fontSize: 12, marginTop: 22, marginBottom: 12, marginLeft: 2 },
  classCard: { borderRadius: 18, paddingHorizontal: 14 },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  pBadge: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pBadgeNum: { fontFamily: FONT.extrabold, fontSize: 12 },
  pBadgeTime: { fontFamily: FONT.bold, fontSize: 8.5, marginTop: 1 },
  classSubject: { fontFamily: FONT.bold, fontSize: 13.5 },
  classMeta: { fontFamily: FONT.regular, fontSize: 11.5, marginTop: 2 },
});
