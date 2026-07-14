import { View, Text, ScrollView, RefreshControl, StatusBar, StyleSheet, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { adToBs, formatBs } from 'bs-calendar';
import { useMyAssignments } from '../../hooks/useAssignments';
import { EmptyState, ErrorState, Icon, LoadingBlock, ScreenHeader, StatusBadge } from '../../components/ui';
import NpText from '../../components/NpText';
import { useLocale, bsLang } from '../../hooks/useLocale';
import type { AppLocale } from '../../lib/i18n';
import type { TFunction } from 'i18next';
import { CARD_SHADOW } from '../../components/ui/Card';
import { chipFor } from '../../lib/assignmentStatus';
import { subjectColor } from '../../lib/subjects';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import type { MyAssignment } from '../../types';

function dueBs(dueDate: string, locale: AppLocale): string {
  return formatBs(adToBs(new Date(`${dueDate}T00:00:00`)), bsLang(locale));
}

function AssignmentCard({ a, colorIndex }: { a: MyAssignment; colorIndex: number }) {
  const c = useThemeColors();
  const { t, locale } = useLocale('student');
  const chip = chipFor(a);
  const color = subjectColor(colorIndex);
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: c.surface }, CARD_SHADOW]}
      activeOpacity={0.85}
      onPress={() =>
        router.push({ pathname: '/(student)/assignment-detail', params: { id: a.id } })
      }
    >
      <View style={styles.cardTop}>
        <View style={styles.subjectRow}>
          <View style={[styles.subjectChip, { backgroundColor: color.bg }]}>
            <Icon name="menu_book" size={13} color={color.text} />
          </View>
          <Text style={[styles.subject, { color: color.text }]} numberOfLines={1}>
            {a.subjectName}
          </Text>
        </View>
        <StatusBadge label={t(chip.labelKey)} bg={chip.bg} color={chip.color} />
      </View>
      <Text style={[styles.title, { color: c.foreground }]} numberOfLines={2}>
        {a.title}
      </Text>
      <View style={styles.cardBottom}>
        <View style={styles.metaItem}>
          <Icon name="schedule" size={13} color={c.mutedForeground} />
          <NpText style={[styles.meta, { color: c.mutedForeground }]}>{t('common:common.due', { date: dueBs(a.dueDate, locale) })}</NpText>
        </View>
        {a.attachmentKeys.length > 0 && (
          <View style={styles.metaItem}>
            <Icon name="attach_file" size={13} color={c.mutedForeground} />
            <Text style={[styles.meta, { color: c.mutedForeground }]}>
              {a.attachmentKeys.length}
            </Text>
          </View>
        )}
        {a.mySubmission?.marks != null && (
          <NpText style={[styles.marks, { color: c.primary }]}>{t('common:common.marks', { value: a.mySubmission.marks })}</NpText>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function StudentAssignments() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, isError, refetch } = useMyAssignments();
  const c = useThemeColors();
  const { t } = useLocale('student');

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const pending = data?.filter((a) => !a.mySubmission) ?? [];
  const done = data?.filter((a) => a.mySubmission) ?? [];
  const countSubtitle = `${t('assignments.pendingCount', { count: pending.length })} · ${t('assignments.submittedCount', { count: done.length })}`;

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        <ScreenHeader
          variant="bar"
          onBack={() => router.back()}
          padTop={12}
          padBottom={16}
          title={t('assignments.title')}
          subtitle={countSubtitle}
          npSubtitle
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
              {pending.length > 0 && (
                <>
                  <NpText style={[styles.sectionLabel, { color: c.foreground }]}>{t('assignments.toSubmit')}</NpText>
                  {pending.map((a, idx) => <AssignmentCard key={a.id} a={a} colorIndex={idx} />)}
                </>
              )}
              {done.length > 0 && (
                <>
                  <NpText style={[styles.sectionLabel, { color: c.foreground }]}>{t('assignments.submitted')}</NpText>
                  {done.map((a, idx) => <AssignmentCard key={a.id} a={a} colorIndex={idx} />)}
                </>
              )}
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
  sectionLabel: { fontFamily: FONT.bold, fontSize: 13, marginTop: 14, marginBottom: 8 },
  card: { borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 },
  subjectRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  subjectChip: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  subject: { fontFamily: FONT.bold, fontSize: 12, flexShrink: 1 },
  title: { fontFamily: FONT.semibold, fontSize: 15, marginBottom: 8 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontFamily: FONT.regular, fontSize: 12 },
  marks: { fontFamily: FONT.bold, fontSize: 12, marginLeft: 'auto' },
});
