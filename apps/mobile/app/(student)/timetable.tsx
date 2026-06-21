import { View, Text, ScrollView, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMyTimetable } from '../../hooks/useStudentMe';
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
  const subtitle = `${DAY_NAMES[data.dayOfWeek]} · ${formatBs(adToBs(new Date(`${data.dateAd}T12:00:00.000Z`)), 'en')}`;

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {/* Plain header */}
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border },
          ]}
        >
          <Text style={[styles.headerTitle, { color: c.foreground }]}>Class routine</Text>
          <Text style={[styles.headerSub, { color: c.mutedForeground }]}>{subtitle}</Text>
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
                  banner={isCurrent ? 'HAPPENING NOW' : undefined}
                  tag={isUpcoming ? 'UPCOMING' : undefined}
                  meta={[
                    { icon: 'person-outline', text: period.teacher.fullName },
                    ...(period.room ? [{ icon: 'location-outline' as const, text: period.room }] : []),
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
  header: { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  headerTitle: { fontFamily: FONT.extrabold, fontSize: 17 },
  headerSub: { fontFamily: FONT.regular, fontSize: 12, marginTop: 3 },
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 0 },
});
