import { View, Text, ScrollView, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { useMemo, useState } from 'react';
import { adToBs, formatBs } from 'bs-calendar';
import { useChildrenAssignments } from '../../hooks/useAssignments';
import { EmptyState, ErrorState, Icon, LoadingBlock, ScreenHeader, SelectChip, StatusBadge } from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';
import { SUBMISSION_CHIPS, isPastDue } from '../../lib/assignmentStatus';
import { useThemeColors } from '../../lib/theme/colors';
import { useLocale, bsLang } from '../../hooks/useLocale';
import NpText from '../../components/NpText';
import { FONT } from '../../lib/theme/fonts';
import type { ChildAssignments } from '../../types';

function dueBs(dueDate: string, locale: 'en' | 'np'): string {
  return formatBs(adToBs(new Date(`${dueDate}T00:00:00`)), bsLang(locale));
}

function ChildAssignmentList({ child }: { child: ChildAssignments }) {
  const c = useThemeColors();
  const { t, locale } = useLocale('parent');
  if (child.assignments.length === 0) {
    return (
      <EmptyState
        icon="clipboard-outline"
        chip
        compact
        title={t('assignments.childEmpty')}
        subtitle={t('assignments.childNoHomework', { name: child.studentName.split(' ')[0] })}
      />
    );
  }
  return (
    <>
      {child.assignments.map((a) => {
        const chip = a.submission
          ? SUBMISSION_CHIPS[a.submission.status]
          : isPastDue(a.dueDate)
            ? SUBMISSION_CHIPS.OVERDUE
            : SUBMISSION_CHIPS.OPEN;
        return (
          <View key={a.id} style={[styles.card, { backgroundColor: c.surface }, CARD_SHADOW]}>
            <View style={styles.cardTop}>
              <Text style={[styles.subject, { color: c.primary }]}>{a.subjectName}</Text>
              <StatusBadge label={t(chip.labelKey)} bg={chip.bg} color={chip.color} />
            </View>
            <Text style={[styles.title, { color: c.foreground }]} numberOfLines={2}>{a.title}</Text>
            <View style={styles.metaRow}>
              <Icon name="schedule" size={13} color={c.mutedForeground} />
              <NpText style={[styles.meta, { color: c.mutedForeground }]}>{t('common:common.due', { date: dueBs(a.dueDate, locale) })}</NpText>
              {a.submission?.marks != null && (
                <NpText style={[styles.marks, { color: c.primary }]}>{t('common:common.marks', { value: a.submission.marks })}</NpText>
              )}
            </View>
            {a.submission?.feedback ? (
              <View style={[styles.feedback, { backgroundColor: c.background }]}>
                <NpText style={[styles.feedbackLabel, { color: c.mutedForeground }]}>{t('common:common.teacherFeedback')}</NpText>
                <Text style={[styles.feedbackText, { color: c.foreground }]}>{a.submission.feedback}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </>
  );
}

export default function ParentAssignments() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, isError, refetch } = useChildrenAssignments();
  const c = useThemeColors();
  const { t } = useLocale('parent');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(() => {
    if (!data?.length) return null;
    return data.find((ch) => ch.studentId === selectedId) ?? data[0];
  }, [data, selectedId]);

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
              {data.length > 1 && (
                <View style={styles.chipsRow}>
                  {data.map((ch) => (
                    <SelectChip
                      key={ch.studentId}
                      label={ch.studentName.split(' ')[0]}
                      selected={ch.studentId === (selected?.studentId ?? null)}
                      onPress={() => setSelectedId(ch.studentId)}
                    />
                  ))}
                </View>
              )}
              {selected && <ChildAssignmentList child={selected} />}
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
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  subject: { fontFamily: FONT.bold, fontSize: 12 },
  title: { fontFamily: FONT.semibold, fontSize: 15, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontFamily: FONT.regular, fontSize: 12 },
  marks: { fontFamily: FONT.bold, fontSize: 12, marginLeft: 'auto' },
  feedback: { borderRadius: 10, padding: 10, marginTop: 10 },
  feedbackLabel: { fontFamily: FONT.bold, fontSize: 10, letterSpacing: 0.8, marginBottom: 4 },
  feedbackText: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 19 },
});
