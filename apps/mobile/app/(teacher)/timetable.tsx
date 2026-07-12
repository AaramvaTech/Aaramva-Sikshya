import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { useLocale } from '../../hooks/useLocale';
import NpText from '../../components/NpText';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useMyTimetable, useMyStaffProfile } from '../../hooks/useTeacher';
import { EmptyState, ErrorState, ScreenHeader } from '../../components/ui';
import { useThemeColors } from '../../lib/theme/colors';
import { subjectColor } from '../../lib/subjects';
import { formatPeriodTime } from '../../lib/time';
import { FONT } from '../../lib/theme/fonts';
import Skeleton from '../../components/Skeleton';

// Sun–Sat abbreviated labels
const DAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function nepalNow(): Date {
  const offset = 5 * 60 + 45;
  const now = new Date();
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + offset * 60000);
}

export default function TeacherRoutine() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, isError, refetch } = useMyTimetable();
  const profileResult = useMyStaffProfile();
  const c = useThemeColors();
  const { t } = useLocale('teacher');
  const todayDow = nepalNow().getDay();
  const [selectedDay, setSelectedDay] = useState<number>(todayDow);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), profileResult.refetch()]);
    setRefreshing(false);
  };

  const schedule = data?.schedule ?? {};

  // Render Sun–Fri always; add Saturday only if it has slots.
  const days = [0, 1, 2, 3, 4, 5].concat((schedule[6]?.length ?? 0) > 0 ? [6] : []);

  const slots = (schedule[selectedDay] ?? [])
    .slice()
    .sort((a, b) => a.periodNumber - b.periodNumber);

  const p = profileResult.data;
  const desig = p?.designationTitle ?? p?.role ?? 'Teacher';

  // Summary: "X classes this week"
  const weeklyTotal = Object.values(schedule).reduce((sum, arr) => sum + (arr?.length ?? 0), 0);
  const routineSummary = weeklyTotal === 1 ? '1 class this week' : `${weeklyTotal} classes this week`;

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {/* ── Hero band ────────────────────────────────────────────── */}
        <ScreenHeader variant="hero" bare padTop={14} padBottom={16}>
          <View style={styles.bandTop}>
            <View style={{ flex: 1 }}>
              <NpText style={[styles.bandTitle, { color: c.foreground }]}>{t('timetable.title')}</NpText>
              <Text style={[styles.bandSub, { color: c.brandMuted }]}>
                {desig} · {routineSummary}
              </Text>
            </View>
            {/* Calendar icon button — decorative; no week endpoint yet */}
            <View style={[styles.calBtn, { backgroundColor: c.surface }]}>
              <Ionicons name="calendar-outline" size={20} color={c.primary} />
            </View>
          </View>

          {/* Day picker pills */}
          <View style={styles.pillRow}>
            {days.map((dow) => {
              const isToday = dow === todayDow;
              const isSelected = dow === selectedDay;
              return (
                <TouchableOpacity
                  key={dow}
                  onPress={() => setSelectedDay(dow)}
                  activeOpacity={0.8}
                  style={[
                    styles.pill,
                    isSelected
                      ? { backgroundColor: c.primary, borderColor: c.primary }
                      : isToday
                        ? { backgroundColor: c.brandSurface, borderColor: c.brandBorder }
                        : { backgroundColor: 'transparent', borderColor: c.brandBorder },
                  ]}
                >
                  <Text
                    style={[
                      styles.pillLabel,
                      { color: isSelected ? c.primaryForeground : isToday ? c.primary : c.brandMuted },
                    ]}
                  >
                    {DAY_SHORT[dow]}
                  </Text>
                  {isToday && (
                    <View
                      style={[
                        styles.pillDot,
                        { backgroundColor: isSelected ? c.primaryForeground : c.primary },
                      ]}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScreenHeader>

        {/* ── Content area ─────────────────────────────────────────── */}
        <View style={styles.body}>
          {isLoading ? (
            <View style={{ gap: 12 }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} style={{ height: 76 }} className="rounded-2xl" />
              ))}
            </View>
          ) : isError ? (
            <View style={{ paddingTop: 24 }}>
              <ErrorState title={t('timetable.errorTitle')} onRetry={() => refetch()} />
            </View>
          ) : slots.length === 0 ? (
            <View style={{ paddingTop: 24 }}>
              <EmptyState
                icon={selectedDay === 6 ? 'sunny-outline' : 'calendar-clear-outline'}
                title={selectedDay === 6 ? t('timetable.saturdayRest') : t('timetable.emptyDay')}
                subtitle={t('timetable.emptySubtitle')}
              />
            </View>
          ) : (
            slots.map((slot, idx) => {
              const sc = subjectColor(idx);
              return (
                <View key={slot.slotId} style={styles.slotRow}>
                  {/* Time gutter */}
                  <View style={styles.gutter}>
                    <Text style={[styles.gutterStart, { color: c.foreground }]}>
                      {formatPeriodTime(slot.startTime)}
                    </Text>
                    <Text style={[styles.gutterEnd, { color: c.mutedForeground }]}>
                      {formatPeriodTime(slot.endTime)}
                    </Text>
                  </View>

                  {/* Slot card */}
                  <View style={[styles.slotCard, { backgroundColor: c.surface }]}>
                    {/* Period pill — top-right */}
                    <View style={[styles.periodPill, { backgroundColor: sc.bg }]}>
                      <Text style={[styles.periodPillText, { color: sc.text }]}>P{slot.periodNumber}</Text>
                    </View>

                    <View style={styles.slotBody}>
                      {/* Tinted icon square */}
                      <View style={[styles.iconSquare, { backgroundColor: sc.bg }]}>
                        <Ionicons name="people-outline" size={23} color={sc.text} />
                      </View>

                      {/* Info column */}
                      <View style={styles.info}>
                        <NpText style={[styles.className, { color: c.foreground }]}>
                          {slot.className}{slot.section}
                        </NpText>
                        <View style={styles.metaRow}>
                          {/* Subject */}
                          <View style={styles.metaItem}>
                            <Ionicons name="calculator-outline" size={13} color={c.mutedForeground} />
                            <Text style={[styles.metaText, { color: c.mutedForeground }]}>
                              {slot.subject.name}
                            </Text>
                          </View>
                          {/* Room */}
                          {slot.room ? (
                            <View style={styles.metaItem}>
                              <Ionicons name="business-outline" size={13} color={c.mutedForeground} />
                              <Text style={[styles.metaText, { color: c.mutedForeground }]}>
                                {slot.room}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Hero band
  bandTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  bandTitle: { fontFamily: FONT.extrabold, fontSize: 17 },
  bandSub: { fontFamily: FONT.semibold, fontSize: 11.5, marginTop: 2 },
  calBtn: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 3,
  },

  // Day pills
  pillRow: { flexDirection: 'row', gap: 7, marginTop: 14 },
  pill: {
    flex: 1, borderRadius: 13, paddingVertical: 9,
    alignItems: 'center', borderWidth: 1.5,
    position: 'relative',
  },
  pillLabel: { fontFamily: FONT.extrabold, fontSize: 9.5, letterSpacing: 0.5 },
  pillDot: {
    position: 'absolute', bottom: 5,
    width: 4, height: 4, borderRadius: 2,
  },

  // Body
  body: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 32 },

  // Slot row: gutter + card
  slotRow: { flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'center' },

  // Time gutter
  gutter: { width: 52, flexShrink: 0, alignItems: 'center', justifyContent: 'center', gap: 1 },
  gutterStart: { fontFamily: FONT.extrabold, fontSize: 13, textAlign: 'center' },
  gutterEnd: { fontFamily: FONT.regular, fontSize: 10, marginTop: 1, textAlign: 'center' },

  // Slot card
  slotCard: {
    flex: 1, borderRadius: 16, padding: 13, paddingRight: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06, shadowRadius: 16, elevation: 3,
    overflow: 'visible',
  },
  periodPill: {
    position: 'absolute', top: 10, right: 10,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, zIndex: 1,
  },
  periodPillText: { fontFamily: FONT.extrabold, fontSize: 10 },
  slotBody: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 36 },
  iconSquare: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  info: { flex: 1, minWidth: 0 },
  className: { fontFamily: FONT.extrabold, fontSize: 13.5 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 5 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: FONT.semibold, fontSize: 11 },
});
