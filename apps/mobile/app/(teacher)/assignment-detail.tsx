import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StatusBar,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import NpText from '../../components/NpText';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { adToBs, formatBs } from 'bs-calendar';
import {
  useAssignmentSubmissions,
  useReviewSubmission,
  useTeacherAssignments,
} from '../../hooks/useAssignments';
import { useFileUrl } from '../../hooks/useFileUrl';
import { SUBMISSION_CHIPS } from '../../lib/assignmentStatus';
import { EmptyState, ErrorState, LoadingBlock, PrimaryButton, ScreenHeader, StatusBadge } from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';
import { useThemeColors } from '../../lib/theme/colors';
import { useLocale, bsLang } from '../../hooks/useLocale';
import { FONT } from '../../lib/theme/fonts';
import type { TeacherSubmissionRow } from '../../types';

/** Opens a student's submission file via its scoped presigned GET. */
function SubmissionFileLink({ fileKey }: { fileKey: string }) {
  const c = useThemeColors();
  const { t, locale } = useLocale('teacher');
  const url = useFileUrl(fileKey);
  return (
    <TouchableOpacity
      style={styles.fileLink}
      disabled={!url}
      onPress={() => url && Linking.openURL(url)}
      activeOpacity={0.7}
    >
      <Ionicons name="document-attach-outline" size={15} color={c.primary} />
      <Text style={[styles.fileLinkText, { color: c.primary }]}>{t('assignmentDetail.openFile')}</Text>
    </TouchableOpacity>
  );
}

function ReviewForm({
  assignmentId,
  submission,
  onDone,
}: {
  assignmentId: string;
  submission: TeacherSubmissionRow;
  onDone: () => void;
}) {
  const c = useThemeColors();
  const { t, locale } = useLocale('teacher');
  const review = useReviewSubmission(assignmentId);
  const [marks, setMarks] = useState(submission.marks != null ? String(submission.marks) : '');
  const [feedback, setFeedback] = useState(submission.feedback ?? '');

  async function save() {
    const parsed = marks.trim() === '' ? undefined : Number(marks);
    if (parsed !== undefined && (Number.isNaN(parsed) || parsed < 0)) {
      Alert.alert(t('assignmentDetail.alertInvalidTitle'), t('assignmentDetail.alertInvalidBody'));
      return;
    }
    if (parsed === undefined && !feedback.trim()) {
      Alert.alert(t('assignmentDetail.alertNothingTitle'), t('assignmentDetail.alertNothingBody'));
      return;
    }
    try {
      await review.mutateAsync({
        submissionId: submission.id,
        ...(parsed !== undefined ? { marks: parsed } : {}),
        ...(feedback.trim() ? { feedback: feedback.trim() } : {}),
      });
      onDone();
    } catch {
      Alert.alert(t('assignmentDetail.alertFailedTitle'), t('assignmentDetail.alertFailedBody'));
    }
  }

  return (
    <View style={[styles.reviewForm, { backgroundColor: c.background }]}>
      <TextInput
        style={[styles.marksInput, { color: c.foreground, borderColor: c.border }]}
        placeholder={t('assignmentDetail.marksPlaceholder')}
        placeholderTextColor={c.mutedForeground}
        keyboardType="decimal-pad"
        value={marks}
        onChangeText={setMarks}
      />
      <TextInput
        style={[styles.feedbackInput, { color: c.foreground, borderColor: c.border }]}
        placeholder={t('assignmentDetail.feedbackPlaceholder')}
        placeholderTextColor={c.mutedForeground}
        multiline
        value={feedback}
        onChangeText={setFeedback}
      />
      <PrimaryButton
        label={submission.status === 'REVIEWED' ? t('assignmentDetail.updateReview') : t('assignmentDetail.saveReview')}
        loading={review.isPending}
        onPress={save}
      />
    </View>
  );
}

export default function TeacherAssignmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useThemeColors();
  const { t, locale } = useLocale('teacher');
  const [refreshing, setRefreshing] = useState(false);
  const [openReviewId, setOpenReviewId] = useState<string | null>(null);

  const assignments = useTeacherAssignments({});
  const view = useAssignmentSubmissions(id ?? '');
  const assignment = assignments.data?.find((a) => a.id === id);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([assignments.refetch(), view.refetch()]);
    setRefreshing(false);
  };

  if (view.isLoading || assignments.isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <LoadingBlock />
      </View>
    );
  }
  if (view.isError || !assignment) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <ScreenHeader variant="plain" compact padTop={12} padBottom={12} title={t('assignmentDetail.title')} />
        <ErrorState onRetry={() => view.refetch()} />
      </View>
    );
  }

  const data = view.data!;
  const dueBs = formatBs(adToBs(new Date(`${assignment.dueDate}T00:00:00`)), bsLang(locale));

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          variant="plain"
          compact
          padTop={12}
          padBottom={12}
          eyebrow={`${assignment.className}${assignment.sectionName ? ` · ${assignment.sectionName}` : ''} — ${assignment.subjectName}`}
          title={assignment.title}
          subtitle={t('assignmentDetail.due', { date: dueBs })}
        />

        <View style={styles.body}>
          {/* Submissions */}
          <NpText style={[styles.sectionLabel, { color: c.foreground }]}>
            {t('assignmentDetail.submissionsCount', { count: data.submissions.length })}
          </NpText>
          {data.submissions.length === 0 ? (
            <EmptyState icon="documents-outline" compact title={t('assignmentDetail.noSubmissions')} />
          ) : (
            data.submissions.map((s) => {
              const chip = SUBMISSION_CHIPS[s.status];
              const open = openReviewId === s.id;
              return (
                <View key={s.id} style={[styles.card, { backgroundColor: c.surface }, CARD_SHADOW]}>
                  <View style={styles.cardTop}>
                    <Text style={[styles.student, { color: c.foreground }]}>
                      {s.rollNumber != null ? `${s.rollNumber} · ` : ''}{s.studentName}
                    </Text>
                    <StatusBadge label={t(chip.labelKey)} bg={chip.bg} color={chip.color} />
                  </View>
                  {s.textAnswer ? (
                    <Text style={[styles.answer, { color: c.mutedForeground }]} numberOfLines={open ? undefined : 2}>
                      {s.textAnswer}
                    </Text>
                  ) : null}
                  <View style={styles.rowBetween}>
                    {s.fileKey ? <SubmissionFileLink fileKey={s.fileKey} /> : <View />}
                    <View style={styles.rowRight}>
                      {s.marks != null && (
                        <NpText style={[styles.marks, { color: c.primary }]}>{t('common:common.marks', { value: s.marks })}</NpText>
                      )}
                      <TouchableOpacity onPress={() => setOpenReviewId(open ? null : s.id)} hitSlop={8}>
                        <Text style={[styles.reviewToggle, { color: c.primary }]}>
                          {open ? t('common:action.cancel') : s.status === 'REVIEWED' ? t('assignmentDetail.reReview') : t('assignmentDetail.review')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {open && (
                    <ReviewForm
                      assignmentId={id!}
                      submission={s}
                      onDone={() => setOpenReviewId(null)}
                    />
                  )}
                </View>
              );
            })
          )}

          {/* Missing — enrolled minus submitted */}
          <NpText style={[styles.sectionLabel, { color: c.foreground }]}>
            {t('assignmentDetail.missingCount', { count: data.missing.length })}
          </NpText>
          {data.missing.length === 0 ? (
            <NpText style={[styles.allDone, { color: c.mutedForeground }]}>
              {t('assignmentDetail.everyoneSubmitted')}
            </NpText>
          ) : (
            <View style={styles.missingWrap}>
              {data.missing.map((m) => (
                <View key={m.studentId} style={styles.missingChip}>
                  <Text style={styles.missingText}>
                    {m.rollNumber != null ? `${m.rollNumber} · ` : ''}{m.studentName}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
  sectionLabel: { fontFamily: FONT.bold, fontSize: 13, marginTop: 14, marginBottom: 8 },
  card: { borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 },
  student: { fontFamily: FONT.semibold, fontSize: 14, flex: 1 },
  answer: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  marks: { fontFamily: FONT.bold, fontSize: 13 },
  reviewToggle: { fontFamily: FONT.bold, fontSize: 13 },
  fileLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  fileLinkText: { fontFamily: FONT.medium, fontSize: 13 },
  reviewForm: { borderRadius: 12, padding: 12, marginTop: 10, gap: 10 },
  marksInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontFamily: FONT.regular, fontSize: 14 },
  feedbackInput: {
    borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 72,
    fontFamily: FONT.regular, fontSize: 14, textAlignVertical: 'top',
  },
  // Semantic red chips matching the web's missing list (not brand-coupled).
  missingWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  missingChip: { backgroundColor: '#FEE2E2', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  missingText: { color: '#DC2626', fontFamily: FONT.medium, fontSize: 12 },
  allDone: { fontFamily: FONT.regular, fontSize: 13 },
});
