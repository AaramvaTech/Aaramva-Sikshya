import { View, Text, ScrollView, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMyTimetable } from '../../hooks/useTeacher';
import Skeleton from '../../components/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

const DAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function nepalNow(): Date {
  const offset = 5 * 60 + 45;
  const now = new Date();
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + offset * 60000);
}

export default function TeacherRoutine() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, isError, refetch } = useMyTimetable();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const todayDow = nepalNow().getDay();

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Render Sun–Fri always; add Saturday only if it has slots.
  const schedule = data?.schedule ?? {};
  const days = [0, 1, 2, 3, 4, 5].concat((schedule[6]?.length ?? 0) > 0 ? [6] : []);

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border },
          ]}
        >
          <Text style={[styles.headerTitle, { color: c.foreground }]}>My routine</Text>
          <Text style={[styles.headerSub, { color: c.mutedForeground }]}>Weekly teaching schedule</Text>
        </View>

        <View style={styles.body}>
          {isLoading ? (
            <View style={{ gap: 10 }}>
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} style={{ height: 76 }} className="rounded-2xl" />)}
            </View>
          ) : isError ? (
            <View style={{ paddingTop: 24 }}>
              <ErrorState title="Couldn't load your routine" onRetry={() => refetch()} />
            </View>
          ) : days.every((d) => (schedule[d]?.length ?? 0) === 0) ? (
            <View style={{ paddingTop: 24 }}>
              <EmptyState icon="calendar-clear-outline" title="No periods scheduled" subtitle="Your weekly routine will appear here." />
            </View>
          ) : (
            days.map((dow) => {
              const slots = (schedule[dow] ?? []).slice().sort((a, b) => a.periodNumber - b.periodNumber);
              const isToday = dow === todayDow;
              return (
                <View
                  key={dow}
                  style={[
                    styles.dayCard,
                    CARD_SHADOW,
                    isToday
                      ? { backgroundColor: c.brandSurface, borderColor: c.brandBorder, borderWidth: 1.5 }
                      : { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1 },
                  ]}
                >
                  <View style={styles.dayHead}>
                    <Text style={[styles.dayLabel, { color: isToday ? c.primary : c.mutedForeground }]}>{DAY_SHORT[dow]}</Text>
                    {isToday && (
                      <View style={[styles.todayBadge, { backgroundColor: c.primary }]}>
                        <Text style={[styles.todayBadgeText, { color: c.primaryForeground }]}>TODAY</Text>
                      </View>
                    )}
                  </View>
                  {slots.length === 0 ? (
                    <Text style={[styles.noClass, { color: c.mutedForeground }]}>No classes</Text>
                  ) : (
                    <View style={styles.chips}>
                      {slots.map((s) => (
                        <View
                          key={s.slotId}
                          style={[styles.chip, { backgroundColor: c.surface, borderColor: isToday ? c.brandBorder : c.border }]}
                        >
                          <Text style={[styles.chipText, { color: isToday ? c.primary : c.foreground }]}>
                            P{s.periodNumber} · {s.className}{s.section}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
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
  header: { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  headerTitle: { fontFamily: FONT.extrabold, fontSize: 17 },
  headerSub: { fontFamily: FONT.regular, fontSize: 12, marginTop: 3 },

  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  dayCard: { borderRadius: 16, padding: 13, marginBottom: 10 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 },
  dayLabel: { fontFamily: FONT.extrabold, fontSize: 12, letterSpacing: 0.5 },
  todayBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  todayBadgeText: { fontFamily: FONT.extrabold, fontSize: 9, letterSpacing: 0.5 },
  noClass: { fontFamily: FONT.medium, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  chipText: { fontFamily: FONT.bold, fontSize: 11 },
});
