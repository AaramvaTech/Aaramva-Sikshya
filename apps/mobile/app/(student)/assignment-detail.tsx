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
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { adToBs, formatBs } from 'bs-calendar';
import { useMyAssignments, useMySubmission, useSubmitAssignment } from '../../hooks/useAssignments';
import { useFileUrl } from '../../hooks/useFileUrl';
import { pickSubmissionFile, uploadSubmissionFile, type PickedFile } from '../../lib/submissionUpload';
import { chipFor, SUBMISSION_CHIPS } from '../../lib/assignmentStatus';
import { ErrorState, Icon, LoadingBlock, PrimaryButton, ScreenHeader, StatusBadge } from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';
import { useThemeColors } from '../../lib/theme/colors';
import { useLocale, bsLang } from '../../hooks/useLocale';
import NpText from '../../components/NpText';
import { FONT } from '../../lib/theme/fonts';

/** Teacher attachment row — resolves the FILE-1 key to a presigned GET and
 *  opens it in the system browser/viewer. */
function AttachmentRow({ fileKey, index }: { fileKey: string; index: number }) {
  const c = useThemeColors();
  const { t } = useLocale('student');
  const url = useFileUrl(fileKey);
  return (
    <TouchableOpacity
      style={[styles.attachRow, { borderColor: c.border }]}
      disabled={!url}
      onPress={() => url && Linking.openURL(url)}
      activeOpacity={0.7}
    >
      <Icon name="attach_file" size={18} color={c.primary} />
      <NpText style={[styles.attachText, { color: c.foreground }]}>{t('assignmentDetail.attachmentN', { number: index + 1 })}</NpText>
      <Icon name="download" size={16} color={c.mutedForeground} />
    </TouchableOpacity>
  );
}

export default function AssignmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useThemeColors();
  const { t, locale } = useLocale('student');
  const [refreshing, setRefreshing] = useState(false);

  const assignments = useMyAssignments();
  const submission = useMySubmission(id ?? '');
  const submitMutation = useSubmitAssignment(id ?? '');

  const [textAnswer, setTextAnswer] = useState('');
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'submitting'>('idle');

  const assignment = assignments.data?.find((a) => a.id === id);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([assignments.refetch(), submission.refetch()]);
    setRefreshing(false);
  };

  async function onPickFile() {
    try {
      const file = await pickSubmissionFile();
      if (file) setPicked(file);
    } catch (err) {
      Alert.alert(t('assignmentDetail.alertFileNotAcceptedTitle'), (err as Error).message);
    }
  }

  async function onSubmit() {
    if (!id) return;
    if (!textAnswer.trim() && !picked) {
      Alert.alert(t('assignmentDetail.alertNothingTitle'), t('assignmentDetail.alertNothingBody'));
      return;
    }
    try {
      let fileKey: string | undefined;
      if (picked) {
        setPhase('uploading');
        fileKey = await uploadSubmissionFile(id, picked);
      }
      setPhase('submitting');
      await submitMutation.mutateAsync({
        ...(textAnswer.trim() ? { textAnswer: textAnswer.trim() } : {}),
        ...(fileKey ? { fileKey } : {}),
      });
      setTextAnswer('');
      setPicked(null);
      await Promise.all([assignments.refetch(), submission.refetch()]);
      Alert.alert(t('assignmentDetail.alertSubmittedTitle'), t('assignmentDetail.alertSubmittedBody'));
    } catch (err) {
      const resp = (err as { response?: { status?: number; data?: { error?: { message?: string } } } }).response;
      // The after-review 409 is a designed state, not an error — surface it honestly.
      const msg = resp?.data?.error?.message
        ?? (err as Error).message
        ?? t('assignmentDetail.couldNotSubmit');
      Alert.alert(resp?.status === 409 ? t('assignmentDetail.alertLockedTitle') : t('assignmentDetail.alertFailedTitle'), msg);
      await submission.refetch();
    } finally {
      setPhase('idle');
    }
  }

  if (assignments.isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <ScreenHeader variant="bar" onBack={() => router.back()} padTop={12} padBottom={12} title={t('assignmentDetail.title')} />
        <LoadingBlock />
      </View>
    );
  }
  if (assignments.isError || !assignment) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <ScreenHeader variant="bar" onBack={() => router.back()} padTop={12} padBottom={12} title={t('assignmentDetail.title')} />
        <ErrorState
          title={assignments.isError ? t('common:state.errorTitle') : t('assignmentDetail.notFound')}
          subtitle={assignments.isError ? undefined : t('assignmentDetail.notFoundBody')}
          onRetry={() => (assignments.isError ? assignments.refetch() : router.back())}
        />
      </View>
    );
  }

  const chip = chipFor(assignment);
  const sub = submission.data;
  const reviewed = sub?.status === 'REVIEWED';
  const closed = assignment.status === 'CLOSED';
  const canSubmit = !reviewed && !closed;
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
          variant="bar"
          onBack={() => router.back()}
          padTop={12}
          padBottom={12}
          title={assignment.title}
          subtitle={
            (assignment.subjectName ? `${assignment.subjectName} · ` : '') +
            t('assignmentDetail.dueTeacher', { date: dueBs, teacher: assignment.teacherName ?? '' })
          }
        />

        <View style={styles.body}>
          <View style={styles.statusRow}>
            <StatusBadge label={t(chip.labelKey)} bg={chip.bg} color={chip.color} />
            {closed && <StatusBadge label={t('common:submission.closed')} bg="#FEF3C7" color="#B45309" />}
          </View>

          {assignment.description ? (
            <View style={[styles.card, { backgroundColor: c.surface }, CARD_SHADOW]}>
              <NpText style={[styles.cardLabel, { color: c.mutedForeground }]}>{t('assignmentDetail.instructions')}</NpText>
              <Text style={[styles.description, { color: c.foreground }]}>{assignment.description}</Text>
            </View>
          ) : null}

          {assignment.attachmentKeys.length > 0 && (
            <View style={[styles.card, { backgroundColor: c.surface }, CARD_SHADOW]}>
              <NpText style={[styles.cardLabel, { color: c.mutedForeground }]}>{t('assignmentDetail.materials')}</NpText>
              {assignment.attachmentKeys.map((k, i) => (
                <AttachmentRow key={k} fileKey={k} index={i} />
              ))}
            </View>
          )}

          {/* My submission */}
          {sub && (
            <View style={[styles.card, { backgroundColor: c.surface }, CARD_SHADOW]}>
              <NpText style={[styles.cardLabel, { color: c.mutedForeground }]}>{t('assignmentDetail.mySubmission')}</NpText>
              <View style={styles.statusRow}>
                <StatusBadge
                  label={t(SUBMISSION_CHIPS[sub.status].labelKey)}
                  bg={SUBMISSION_CHIPS[sub.status].bg}
                  color={SUBMISSION_CHIPS[sub.status].color}
                />
                {sub.marks != null && (
                  <NpText style={[styles.marksBig, { color: c.primary }]}>{t('common:common.marks', { value: sub.marks })}</NpText>
                )}
              </View>
              {sub.textAnswer ? (
                <Text style={[styles.description, { color: c.foreground }]}>{sub.textAnswer}</Text>
              ) : null}
              {sub.fileKey ? <AttachmentRow fileKey={sub.fileKey} index={0} /> : null}
              {reviewed && sub.feedback ? (
                <View style={[styles.feedback, { backgroundColor: c.background }]}>
                  <NpText style={[styles.cardLabel, { color: c.mutedForeground }]}>{t('assignmentDetail.teacherFeedback')}</NpText>
                  <Text style={[styles.description, { color: c.foreground }]}>{sub.feedback}</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Submit / resubmit form — or the honest blocked states */}
          {reviewed ? (
            <View style={[styles.note, { backgroundColor: c.surface }]}>
              <Icon name="lock" size={16} color={c.mutedForeground} />
              <NpText style={[styles.noteText, { color: c.mutedForeground }]}>
                {t('assignmentDetail.reviewedLock')}
              </NpText>
            </View>
          ) : closed ? (
            <View style={[styles.note, { backgroundColor: c.surface }]}>
              <Icon name="lock" size={16} color={c.mutedForeground} />
              <NpText style={[styles.noteText, { color: c.mutedForeground }]}>
                {t('assignmentDetail.closedLock')}
              </NpText>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: c.surface }, CARD_SHADOW]}>
              <NpText style={[styles.cardLabel, { color: c.mutedForeground }]}>
                {sub ? t('assignmentDetail.resubmit') : t('assignmentDetail.submitYourWork')}
              </NpText>
              <TextInput
                style={[styles.input, { color: c.foreground, borderColor: c.border }]}
                placeholder={t('assignmentDetail.writeAnswer')}
                placeholderTextColor={c.mutedForeground}
                multiline
                value={textAnswer}
                onChangeText={setTextAnswer}
              />
              <TouchableOpacity style={[styles.attachRow, { borderColor: c.border }]} onPress={onPickFile} activeOpacity={0.7}>
                <Icon name="attach_file" size={18} color={c.primary} fill={!!picked} />
                <Text style={[styles.attachText, { color: picked ? c.foreground : c.mutedForeground }]} numberOfLines={1}>
                  {picked ? picked.name : t('assignmentDetail.attachHint')}
                </Text>
                {picked && (
                  <TouchableOpacity onPress={() => setPicked(null)} hitSlop={8}>
                    <Icon name="cancel" size={18} color={c.mutedForeground} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
              <PrimaryButton
                label={
                  phase === 'uploading'
                    ? t('assignmentDetail.uploading')
                    : phase === 'submitting'
                      ? t('assignmentDetail.submitting')
                      : sub
                        ? t('assignmentDetail.resubmitBtn')
                        : t('assignmentDetail.submit')
                }
                loading={phase !== 'idle'}
                onPress={onSubmit}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  card: { borderRadius: 14, padding: 14 },
  cardLabel: { fontFamily: FONT.bold, fontSize: 10.5, letterSpacing: 0.8, marginBottom: 8 },
  description: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 21 },
  attachRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, borderStyle: 'dashed',
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 8,
  },
  attachText: { fontFamily: FONT.medium, fontSize: 13, flex: 1 },
  input: {
    borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 96,
    fontFamily: FONT.regular, fontSize: 14, textAlignVertical: 'top',
  },
  feedback: { borderRadius: 10, padding: 10, marginTop: 10 },
  marksBig: { fontFamily: FONT.bold, fontSize: 15, marginLeft: 'auto' },
  note: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, padding: 14,
  },
  noteText: { fontFamily: FONT.medium, fontSize: 13, flex: 1 },
});
