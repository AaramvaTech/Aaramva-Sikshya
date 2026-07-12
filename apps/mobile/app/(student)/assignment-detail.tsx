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
import { Ionicons } from '@expo/vector-icons';
import { adToBs, formatBs } from 'bs-calendar';
import { useMyAssignments, useMySubmission, useSubmitAssignment } from '../../hooks/useAssignments';
import { useFileUrl } from '../../hooks/useFileUrl';
import { pickSubmissionFile, uploadSubmissionFile, type PickedFile } from '../../lib/submissionUpload';
import { chipFor, SUBMISSION_CHIPS } from '../../lib/assignmentStatus';
import { ErrorState, LoadingBlock, PrimaryButton, ScreenHeader, StatusBadge } from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

/** Teacher attachment row — resolves the FILE-1 key to a presigned GET and
 *  opens it in the system browser/viewer. */
function AttachmentRow({ fileKey, index }: { fileKey: string; index: number }) {
  const c = useThemeColors();
  const url = useFileUrl(fileKey);
  return (
    <TouchableOpacity
      style={[styles.attachRow, { borderColor: c.border }]}
      disabled={!url}
      onPress={() => url && Linking.openURL(url)}
      activeOpacity={0.7}
    >
      <Ionicons name="document-attach-outline" size={18} color={c.primary} />
      <Text style={[styles.attachText, { color: c.foreground }]}>Attachment {index + 1}</Text>
      <Ionicons name="open-outline" size={16} color={c.mutedForeground} />
    </TouchableOpacity>
  );
}

export default function AssignmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useThemeColors();
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
      Alert.alert('File not accepted', (err as Error).message);
    }
  }

  async function onSubmit() {
    if (!id) return;
    if (!textAnswer.trim() && !picked) {
      Alert.alert('Nothing to submit', 'Write an answer, attach a file, or both.');
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
      Alert.alert('Submitted', 'Your work has been handed in.');
    } catch (err) {
      const resp = (err as { response?: { status?: number; data?: { error?: { message?: string } } } }).response;
      // The after-review 409 is a designed state, not an error — surface it honestly.
      const msg = resp?.data?.error?.message
        ?? (err as Error).message
        ?? 'Could not submit — try again.';
      Alert.alert(resp?.status === 409 ? 'Submission locked' : 'Submission failed', msg);
      await submission.refetch();
    } finally {
      setPhase('idle');
    }
  }

  if (assignments.isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <LoadingBlock />
      </View>
    );
  }
  if (assignments.isError || !assignment) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <ScreenHeader variant="plain" compact padTop={12} padBottom={12} title="Assignment" />
        <ErrorState
          title={assignments.isError ? "Couldn't load" : 'Not found'}
          subtitle={assignments.isError ? undefined : 'This assignment is no longer available.'}
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
  const dueBs = formatBs(adToBs(new Date(`${assignment.dueDate}T00:00:00`)), 'en');

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
          eyebrow={assignment.subjectName}
          title={assignment.title}
          subtitle={`Due ${dueBs} — ${assignment.teacherName ?? ''}`}
        />

        <View style={styles.body}>
          <View style={styles.statusRow}>
            <StatusBadge label={chip.label} bg={chip.bg} color={chip.color} />
            {closed && <StatusBadge label="Closed" bg="#FEF3C7" color="#B45309" />}
          </View>

          {assignment.description ? (
            <View style={[styles.card, { backgroundColor: c.surface }, CARD_SHADOW]}>
              <Text style={[styles.cardLabel, { color: c.mutedForeground }]}>INSTRUCTIONS</Text>
              <Text style={[styles.description, { color: c.foreground }]}>{assignment.description}</Text>
            </View>
          ) : null}

          {assignment.attachmentKeys.length > 0 && (
            <View style={[styles.card, { backgroundColor: c.surface }, CARD_SHADOW]}>
              <Text style={[styles.cardLabel, { color: c.mutedForeground }]}>MATERIALS</Text>
              {assignment.attachmentKeys.map((k, i) => (
                <AttachmentRow key={k} fileKey={k} index={i} />
              ))}
            </View>
          )}

          {/* My submission */}
          {sub && (
            <View style={[styles.card, { backgroundColor: c.surface }, CARD_SHADOW]}>
              <Text style={[styles.cardLabel, { color: c.mutedForeground }]}>MY SUBMISSION</Text>
              <View style={styles.statusRow}>
                <StatusBadge
                  label={SUBMISSION_CHIPS[sub.status].label}
                  bg={SUBMISSION_CHIPS[sub.status].bg}
                  color={SUBMISSION_CHIPS[sub.status].color}
                />
                {sub.marks != null && (
                  <Text style={[styles.marksBig, { color: c.primary }]}>{sub.marks} marks</Text>
                )}
              </View>
              {sub.textAnswer ? (
                <Text style={[styles.description, { color: c.foreground }]}>{sub.textAnswer}</Text>
              ) : null}
              {sub.fileKey ? <AttachmentRow fileKey={sub.fileKey} index={0} /> : null}
              {reviewed && sub.feedback ? (
                <View style={[styles.feedback, { backgroundColor: c.background }]}>
                  <Text style={[styles.cardLabel, { color: c.mutedForeground }]}>TEACHER FEEDBACK</Text>
                  <Text style={[styles.description, { color: c.foreground }]}>{sub.feedback}</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Submit / resubmit form — or the honest blocked states */}
          {reviewed ? (
            <View style={[styles.note, { backgroundColor: c.surface }]}>
              <Ionicons name="lock-closed-outline" size={16} color={c.mutedForeground} />
              <Text style={[styles.noteText, { color: c.mutedForeground }]}>
                This submission has been reviewed — it can no longer be changed.
              </Text>
            </View>
          ) : closed ? (
            <View style={[styles.note, { backgroundColor: c.surface }]}>
              <Ionicons name="lock-closed-outline" size={16} color={c.mutedForeground} />
              <Text style={[styles.noteText, { color: c.mutedForeground }]}>
                This assignment is closed and no longer accepts submissions.
              </Text>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: c.surface }, CARD_SHADOW]}>
              <Text style={[styles.cardLabel, { color: c.mutedForeground }]}>
                {sub ? 'RESUBMIT' : 'SUBMIT YOUR WORK'}
              </Text>
              <TextInput
                style={[styles.input, { color: c.foreground, borderColor: c.border }]}
                placeholder="Write your answer…"
                placeholderTextColor={c.mutedForeground}
                multiline
                value={textAnswer}
                onChangeText={setTextAnswer}
              />
              <TouchableOpacity style={[styles.attachRow, { borderColor: c.border }]} onPress={onPickFile} activeOpacity={0.7}>
                <Ionicons name={picked ? 'document-attach' : 'attach-outline'} size={18} color={c.primary} />
                <Text style={[styles.attachText, { color: picked ? c.foreground : c.mutedForeground }]} numberOfLines={1}>
                  {picked ? picked.name : 'Attach a file (image, PDF or Word — max 10 MB)'}
                </Text>
                {picked && (
                  <TouchableOpacity onPress={() => setPicked(null)} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={c.mutedForeground} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
              <PrimaryButton
                label={
                  phase === 'uploading'
                    ? 'Uploading file…'
                    : phase === 'submitting'
                      ? 'Submitting…'
                      : sub
                        ? 'Resubmit'
                        : 'Submit'
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
