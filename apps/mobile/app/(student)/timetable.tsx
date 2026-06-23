import { View, Text, ScrollView, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMyTimetable, useMyProfile } from '../../hooks/useStudentMe';
import Skeleton from '../../components/Skeleton';
import { Card, EmptyState, ErrorState, SubjectSlot } from '../../components/ui';
import { subjectColor } from '../../lib/subjects';
import type { TimetablePeriod } from '../../types';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import { formatBs, adToBs } from 'bs-calendar';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function isCurrentPeriod(period: TimetablePeriod): boolean {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = period.startTime.split(':').map(Number);
  const [eh, em] = period.endTime.split(':').map(Number);
  return nowMin >= sh * 60 + sm && nowMin < eh * 60 + em;
}
function isUpcomingPeriod(period: TimetablePeriod): boolean {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = period.startTime.split(':').map(Number);
  return sh * 60 + sm > nowMin;
}

export default function StudentTimetable() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, isError, refetch } = useMyTimetable();
  const { data: profile } = useMyProfile();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <Skeleton style={{ height: 92 }} className="rounded-none" />
        <View style={{ paddingHorizontal: 16, marginTop: 16, gap: 12 }}>
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} style={{ height: 88 }} className="rounded-2xl" />)}
        </View>
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={[styles.root, { backgroundColor: c.background, justifyContent: 'center' }]}>
        <ErrorState title="Couldn't load today's classes" onRetry={() => refetch()} />
      </View>
    );
  }

  const totalPeriods = data.periods.length;
  const dayName = DAY_NAMES[data.dayOfWeek];
  const bsDate = formatBs(adToBs(new Date(`${data.dateAd}T12:00:00.000Z`)), 'en');
  // Routine summary: "X periods · Mon, 2081 Ashadh 15"
  const routineSummary = totalPeriods > 0 ? `${totalPeriods} period${totalPeriods !== 1 ? 's' : ''} · ${dayName}` : dayName;

  // Class label from profile enrollment
  const enrollment = profile?.currentEnrollment;
  const classLabel = enrollment
    ? `${enrollment.className}${enrollment.sectionName}`
    : '';

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {/* ── Brand-tinted header band ─────────────────────── */}
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + 14,
              backgroundColor: c.brandSurface,
            },
          ]}
        >
          <View style={styles.headerTop}>
            <View style={styles.headerText}>
              <Text style={[styles.headerTitle, { color: c.foreground, fontFamily: FONT.extrabold }]}>
                Class routine
              </Text>
              <Text style={[styles.headerSub, { color: c.brandMuted, fontFamily: FONT.semibold }]}>
                {classLabel ? `${classLabel} · ` : ''}{routineSummary}
              </Text>
            </View>
            {/* Calendar icon chip */}
            <View style={[styles.calendarChip, { backgroundColor: c.surface, shadowColor: c.foreground }]}>
              <Ionicons name="calendar-outline" size={20} color={c.primary} />
            </View>
          </View>
          {/* Today's date chip */}
          <View style={[styles.datePill, { backgroundColor: c.surface }]}>
            <Text style={[styles.datePillText, { color: c.foreground, fontFamily: FONT.bold }]}>
              {bsDate}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          {!data.isSchoolDay ? (
            <Card elevated padded style={{ paddingVertical: 32 }}>
              <EmptyState
                chip
                icon="sunny"
                title="No school today"
                subtitle={data.dayOfWeek === 6 ? "Saturday's a holiday — rest up." : "You're not in a class yet. Ask your school to add you."}
              />
            </Card>
          ) : totalPeriods === 0 ? (
            <Card elevated padded style={{ paddingVertical: 32 }}>
              <EmptyState icon="calendar-clear-outline" title="Nothing scheduled for today." />
            </Card>
          ) : (
            data.periods.map((period, idx) => {
              const color = subjectColor(idx);
              const isCurrent = isCurrentPeriod(period);
              const isUpcoming = !isCurrent && isUpcomingPeriod(period);
              const isPast = !isCurrent && !isUpcoming;
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
                  tag={isUpcoming ? 'UPCOMING' : undefined}
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
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 17 },
  headerSub: { fontSize: 11.5, marginTop: 2 },
  calendarChip: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  datePill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  datePillText: { fontSize: 12 },
  body: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 32 },
});
