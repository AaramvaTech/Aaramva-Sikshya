import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useMyWeeklyTimetable, useMyProfile } from '../../hooks/useStudentMe';
import Skeleton from '../../components/Skeleton';
import { Card, EmptyState, ErrorState, SubjectSlot, ScreenHeader } from '../../components/ui';
import { subjectColor } from '../../lib/subjects';
import type { SectionTimetableSlot } from '../../types';
import { useThemeColors } from '../../lib/theme/colors';
import { useLocale, bsLang } from '../../hooks/useLocale';
import NpText from '../../components/NpText';
import { FONT } from '../../lib/theme/fonts';
import { formatBs, todayBs } from 'bs-calendar';

// Platform convention: the school week is Sunday–Friday (Saturday is the weekend).
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function minutesNow(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}
function startMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function endMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export default function StudentTimetable() {
  const c = useThemeColors();
  const { t, locale } = useLocale('student');
  const shortDays = t('common:days.short', { returnObjects: true }) as string[];
  const longDays = t('common:days.long', { returnObjects: true }) as string[];
  const [refreshing, setRefreshing] = useState(false);

  const todayDow = new Date().getDay(); // 0=Sun … 6=Sat
  // Default to today when it's a school day (Sun–Fri); on Saturday default to Sunday.
  const [selectedDay, setSelectedDay] = useState<number>(todayDow <= 5 ? todayDow : 0);

  const { data: profile } = useMyProfile();
  const sectionId = profile?.currentEnrollment?.sectionId ?? null;
  const { data: slots, isLoading, isError, refetch } = useMyWeeklyTimetable(sectionId);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const daySlots: SectionTimetableSlot[] = (slots ?? [])
    .filter((s) => s.dayOfWeek === selectedDay)
    .sort((a, b) => a.periodNumber - b.periodNumber);

  const isToday = selectedDay === todayDow;
  const nowMin = minutesNow();

  const enrollment = profile?.currentEnrollment;
  const classLabel = enrollment ? `${enrollment.className}${enrollment.sectionName}` : '';

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {/* Brand-tinted header band */}
        <ScreenHeader variant="hero" bare rounded padTop={14} padBottom={16}>
          <View style={styles.headerTop}>
            <View style={styles.headerText}>
              <NpText style={[styles.headerTitle, { color: c.foreground, fontFamily: FONT.extrabold }]}>
                {t('timetable.title')}
              </NpText>
              <NpText style={[styles.headerSub, { color: c.brandMuted, fontFamily: FONT.semibold }]}>
                {classLabel ? `${classLabel} · ` : ''}{t('timetable.weekly')}
              </NpText>
            </View>
            <View style={[styles.calendarChip, { backgroundColor: c.surface, shadowColor: c.foreground }]}>
              <Ionicons name="calendar-outline" size={20} color={c.primary} />
            </View>
          </View>
          <View style={[styles.datePill, { backgroundColor: c.surface }]}>
            <NpText style={[styles.datePillText, { color: c.foreground, fontFamily: FONT.bold }]}>
              {formatBs(todayBs(), bsLang(locale))}
            </NpText>
          </View>
        </ScreenHeader>

        <View style={styles.body}>
          {/* Day selector — Sun–Fri */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
            {DAY_NAMES.map((_name, dow) => {
              const isSelected = dow === selectedDay;
              const isTodayChip = dow === todayDow;
              return (
                <TouchableOpacity
                  key={dow}
                  onPress={() => setSelectedDay(dow)}
                  activeOpacity={0.85}
                  accessibilityState={{ selected: isSelected }}
                  className={isSelected ? 'bg-primary' : 'bg-surface'}
                  style={styles.dayChip}
                >
                  <Text
                    className={isSelected ? 'text-primary-foreground' : 'text-foreground'}
                    style={styles.dayChipText}
                  >
                    {shortDays[dow]}
                  </Text>
                  {isTodayChip && (
                    <View style={styles.todayDot} className={isSelected ? 'bg-primary-foreground' : 'bg-primary'} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Periods for the selected day */}
          {isLoading ? (
            <View style={{ gap: 12, marginTop: 4 }}>
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} style={{ height: 88 }} className="rounded-2xl" />)}
            </View>
          ) : isError ? (
            <Card elevated padded style={{ paddingVertical: 32, marginTop: 4 }}>
              <ErrorState title={t('timetable.errorTitle')} onRetry={() => void refetch()} />
            </Card>
          ) : daySlots.length === 0 ? (
            <Card elevated padded style={{ paddingVertical: 32, marginTop: 4 }}>
              <EmptyState icon="calendar-clear-outline" title={t('timetable.emptyDay', { day: longDays[selectedDay] })} />
            </Card>
          ) : (
            <View style={{ marginTop: 4 }}>
              {daySlots.map((period, idx) => {
                const color = subjectColor(idx);
                const isCurrent = isToday && nowMin >= startMinutes(period.startTime) && nowMin < endMinutes(period.endTime);
                const isUpcoming = isToday && !isCurrent && startMinutes(period.startTime) > nowMin;
                const isPast = isToday && !isCurrent && !isUpcoming;
                return (
                  <SubjectSlot
                    key={period.slotId}
                    color={color}
                    startTime={period.startTime}
                    endTime={period.endTime}
                    periodNumber={period.periodNumber}
                    subjectName={period.subject.name}
                    subjectCode={period.subject.code ?? 'SUB'}
                    banner={isCurrent ? 'NOW' : undefined}
                    meta={[
                      { icon: 'person', text: period.teacher.fullName },
                      ...(period.room ? [{ icon: 'enter-outline' as const, text: period.room }] : []),
                    ]}
                    style={
                      isCurrent
                        ? {
                            borderWidth: 2,
                            borderColor: color.bar,
                            shadowColor: color.bar,
                            shadowOffset: { width: 0, height: 6 },
                            shadowOpacity: 0.2,
                            shadowRadius: 16,
                            elevation: 8,
                          }
                        : isPast
                          ? { opacity: 0.55 }
                          : undefined
                    }
                  />
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 17 },
  headerSub: { fontSize: 11.5, marginTop: 2 },
  calendarChip: {
    width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 4,
  },
  datePill: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  datePillText: { fontSize: 12 },
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  dayRow: { gap: 8, paddingRight: 8, paddingBottom: 14 },
  dayChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, alignItems: 'center',
    minWidth: 52, minHeight: 44, justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  dayChipText: { fontSize: 13, fontWeight: '600' },
  todayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
});
