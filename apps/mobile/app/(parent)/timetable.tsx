import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { todayBs, formatBs } from 'bs-calendar';

import { useMyChildren, useChildTimetable } from '../../hooks/useParentChild';
import { useAuthStore } from '../../store/auth';
import { useThemeColors } from '../../lib/theme/colors';
import { useLocale, bsLang } from '../../hooks/useLocale';
import NpText from '../../components/NpText';
import { ScreenHeader, ChildPicker, Card, CardLabel, EmptyState, ErrorState } from '../../components/ui';
import Skeleton from '../../components/Skeleton';
import { formatPeriodRange } from '../../lib/time';
import type { SectionTimetableSlot } from '../../types';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ParentTimetable() {
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(() => new Date().getDay());
  const c = useThemeColors();
  const { t, locale } = useLocale('parent');
  const shortDays = t('common:days.short', { returnObjects: true }) as string[];
  const longDays = t('common:days.long', { returnObjects: true }) as string[];

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

  const timetableQuery = useChildTimetable(sectionId);
  const slots = timetableQuery.data ?? [];
  const todayDow = new Date().getDay();

  const daySlots: SectionTimetableSlot[] = slots
    .filter((s) => s.dayOfWeek === selectedDay)
    .sort((a, b) => a.periodNumber - b.periodNumber);

  const onRefresh = async () => {
    setRefreshing(true);
    await timetableQuery.refetch();
    setRefreshing(false);
  };

  return (
    <ScrollView
      className="bg-background"
      style={styles.fill}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
    >
      <ScreenHeader
        eyebrow={selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : t('timetable.title')}
        title={t('timetable.title')}
        subtitle={formatBs(todayBs(), bsLang(locale))}
        overlap
      >
        <ChildPicker children={children} selectedId={effectiveChildId} onSelect={setSelectedChildId} />
      </ScreenHeader>

      <View style={styles.cards}>
        {/* Day selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
          {DAY_NAMES.map((_name, dow) => {
            const isSat = dow === 6;
            const isToday = dow === todayDow;
            const isSelected = dow === selectedDay;
            return (
              <TouchableOpacity
                key={dow}
                disabled={isSat}
                onPress={() => setSelectedDay(dow)}
                activeOpacity={0.8}
                accessibilityState={{ selected: isSelected, disabled: isSat }}
                className={isSelected ? 'bg-primary' : 'bg-surface'}
                style={[styles.dayChip, isSat && styles.dayChipDisabled]}
              >
                <NpText
                  className={isSelected ? 'text-primary-foreground' : 'text-foreground'}
                  style={styles.dayChipText}
                >
                  {shortDays[dow]}
                </NpText>
                {isToday && (
                  <View
                    style={styles.todayDot}
                    className={isSelected ? 'bg-primary-foreground' : 'bg-primary'}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Periods */}
        <Card padded style={styles.lastCard}>
          <CardLabel>{t('timetable.dayPeriods', { day: longDays[selectedDay] })}</CardLabel>
          {timetableQuery.isLoading ? (
            <View style={{ gap: 10 }}>
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 52 }} className="rounded-xl" />)}
            </View>
          ) : timetableQuery.isError ? (
            <ErrorState compact title={t('timetable.errorTitle')} onRetry={() => void timetableQuery.refetch()} />
          ) : selectedDay === 6 ? (
            <EmptyState icon="sunny-outline" title={t('timetable.saturdayNoSchool')} />
          ) : daySlots.length === 0 ? (
            <EmptyState icon="moon-outline" title={t('timetable.emptyTitle')} />
          ) : (
            daySlots.map((p, idx) => (
              <View
                key={p.slotId}
                style={styles.periodRow}
                className={idx < daySlots.length - 1 ? 'border-b border-border' : undefined}
              >
                <View className="bg-primary/10" style={styles.periodBadge}>
                  <Text className="text-primary" style={styles.periodBadgeText}>{p.periodNumber}</Text>
                </View>
                <View style={styles.periodInfo}>
                  <View style={styles.periodTop}>
                    <NpText className="text-foreground" style={styles.subject}>{p.subject.name}</NpText>
                    <Text className="text-muted-foreground" style={styles.time}>{formatPeriodRange(p.startTime, p.endTime)}</Text>
                  </View>
                  <NpText className="text-muted-foreground" style={styles.teacher}>
                    {p.teacher.fullName}{p.room ? ` · ${p.room}` : ''}
                  </NpText>
                </View>
              </View>
            ))
          )}
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cards: { marginTop: -56, paddingHorizontal: 16, gap: 12 },
  dayRow: { gap: 8, paddingRight: 8 },
  dayChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, alignItems: 'center',
    minWidth: 52, minHeight: 44, justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  dayChipDisabled: { opacity: 0.4 },
  dayChipText: { fontSize: 13, fontWeight: '600' },
  todayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
  lastCard: { marginBottom: 24 },
  periodRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12 },
  periodBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 2 },
  periodBadgeText: { fontSize: 12, fontWeight: '800' },
  periodInfo: { flex: 1 },
  periodTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  subject: { fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },
  time: { fontSize: 12, fontWeight: '500' },
  teacher: { fontSize: 12 },
});
