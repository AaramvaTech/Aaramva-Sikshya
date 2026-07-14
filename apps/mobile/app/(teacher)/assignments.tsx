import { View, Text, ScrollView, RefreshControl, StatusBar, StyleSheet, TouchableOpacity } from 'react-native';
import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { adToBs, formatBs } from 'bs-calendar';
import { useTeacherAssignments } from '../../hooks/useAssignments';
import { EmptyState, ErrorState, Icon, LoadingBlock, ScreenHeader, SelectChip, StatusBadge } from '../../components/ui';
import { useLocale, bsLang } from '../../hooks/useLocale';
import NpText from '../../components/NpText';
import { CARD_SHADOW } from '../../components/ui/Card';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import type { AssignmentStatus } from '../../types';

const STATUS_CHIPS: Record<AssignmentStatus, { label: string; labelKey: string; bg: string; color: string }> = {
  DRAFT: { label: 'Draft', labelKey: 'common:assignmentStatus.draft', bg: '#F1F5F9', color: '#475569' },
  PUBLISHED: { label: 'Published', labelKey: 'common:assignmentStatus.published', bg: '#DCFCE7', color: '#15803D' },
  CLOSED: { label: 'Closed', labelKey: 'common:assignmentStatus.closed', bg: '#FEF3C7', color: '#B45309' },
};

function dueBs(dueDate: string, locale: 'en' | 'np'): string {
  return formatBs(adToBs(new Date(`${dueDate}T00:00:00`)), bsLang(locale));
}

export default function TeacherAssignments() {
  const [refreshing, setRefreshing] = useState(false);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useTeacherAssignments({});
  const c = useThemeColors();
  const { t, locale } = useLocale('teacher');

  // Class filter chips derived from the loaded list (mobile is read+review —
  // creation and richer filtering stay on the web portal).
  const classNames = useMemo(
    () => [...new Set((data ?? []).map((a) => a.className).filter(Boolean))] as string[],
    [data],
  );
  const filtered = classFilter ? (data ?? []).filter((a) => a.className === classFilter) : (data ?? []);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        <ScreenHeader
          variant="plain"
          compact
          padTop={12}
          padBottom={12}
          title={t('assignments.title')}
          subtitle={t('assignments.subtitle')}
        />

        <View style={styles.body}>
          {isLoading ? (
            <LoadingBlock />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : !data?.length ? (
            <EmptyState
              icon="clipboard-outline"
              chip
              title={t('assignments.emptyTitle')}
              subtitle={t('assignments.emptySubtitle')}
            />
          ) : (
            <>
              {classNames.length > 1 && (
                <View style={styles.chipsRow}>
                  <SelectChip label={t('assignments.all')} selected={!classFilter} onPress={() => setClassFilter(null)} />
                  {classNames.map((name) => (
                    <SelectChip
                      key={name}
                      label={name}
                      selected={classFilter === name}
                      onPress={() => setClassFilter(name)}
                    />
                  ))}
                </View>
              )}
              {filtered.map((a) => {
                const chip = STATUS_CHIPS[a.status];
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.card, { backgroundColor: c.surface }, CARD_SHADOW]}
                    activeOpacity={0.85}
                    onPress={() =>
                      router.push({ pathname: '/(teacher)/assignment-detail', params: { id: a.id } })
                    }
                  >
                    <View style={styles.cardTop}>
                      <Text style={[styles.subject, { color: c.primary }]}>
                        {a.className}{a.sectionName ? ` · ${a.sectionName}` : ''} — {a.subjectName}
                      </Text>
                      <StatusBadge label={t(chip.labelKey)} bg={chip.bg} color={chip.color} />
                    </View>
                    <Text style={[styles.title, { color: c.foreground }]} numberOfLines={2}>{a.title}</Text>
                    <View style={styles.metaRow}>
                      <Icon name="schedule" size={13} color={c.mutedForeground} />
                      <NpText style={[styles.meta, { color: c.mutedForeground }]}>{t('common:common.due', { date: dueBs(a.dueDate, locale) })}</NpText>
                      <View style={styles.metaItem}>
                        <Icon name="groups" size={13} color={c.mutedForeground} />
                        <NpText style={[styles.meta, { color: c.mutedForeground }]}>
                          {t('assignments.submittedCount', { count: a.submissionCount ?? 0 })}
                        </NpText>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  card: { borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 },
  subject: { fontFamily: FONT.bold, fontSize: 12, flex: 1 },
  title: { fontFamily: FONT.semibold, fontSize: 15, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontFamily: FONT.regular, fontSize: 12 },
});
