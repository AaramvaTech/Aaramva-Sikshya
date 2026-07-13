import {
  View, Text, FlatList, TextInput, Alert, RefreshControl, Switch, StyleSheet,
} from 'react-native';
import { useLocale } from '../../hooks/useLocale';
import NpText from '../../components/NpText';
import { Ionicons } from '@expo/vector-icons';
import { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import {
  useMyExamSchedules, useMySections, useSectionStudents, useExamMarks, useBulkSubmitMarks,
} from '../../hooks/useTeacher';
import { adToBs, formatBs } from 'bs-calendar';
import type { ExamSchedule, MySection, StudentProfile, ExamMark, BulkMarkEntry } from '../../types';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import { STATUS_CONFIG } from '../../lib/attendance';
import {
  ScreenHeader, Card, CardLabel, PrimaryButton, SelectableRow, EmptyState, LoadingBlock, ErrorState,
} from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';

// ── Per-student mark state ────────────────────────────────────────────────────

interface MarkState { theory: string; practical: string; marks: string; isAbsent: boolean; remarks: string }
function emptyMark(): MarkState { return { theory: '', practical: '', marks: '', isAbsent: false, remarks: '' }; }
function prefillMark(em: ExamMark, isSplit: boolean): MarkState {
  if (em.isAbsent) return { theory: '', practical: '', marks: '', isAbsent: true, remarks: em.remarks ?? '' };
  if (isSplit) return {
    theory: em.theoryMarks != null ? String(em.theoryMarks) : '',
    practical: em.practicalMarks != null ? String(em.practicalMarks) : '',
    marks: '', isAbsent: false, remarks: em.remarks ?? '',
  };
  return { theory: '', practical: '', marks: em.marksObtained != null ? String(em.marksObtained) : '', isAbsent: false, remarks: em.remarks ?? '' };
}

function validateMarks(_studentId: string, state: MarkState, schedule: ExamSchedule, isSplit: boolean): string | null {
  if (state.isAbsent) return null;
  if (isSplit) {
    const theoryFilled = state.theory !== '';
    const practicalFilled = state.practical !== '';
    if (theoryFilled !== practicalFilled) return 'Enter both theory and practical, or mark absent';
    const t = parseFloat(state.theory);
    const p = parseFloat(state.practical);
    if (theoryFilled && (isNaN(t) || t < 0 || t > (schedule.theoryMarks ?? 0))) return `Theory marks must be between 0 and ${schedule.theoryMarks}`;
    if (practicalFilled && (isNaN(p) || p < 0 || p > (schedule.practicalMarks ?? 0))) return `Practical marks must be between 0 and ${schedule.practicalMarks}`;
  } else {
    const m = parseFloat(state.marks);
    if (state.marks !== '' && (isNaN(m) || m < 0 || m > schedule.fullMarks)) return `Marks must be between 0 and ${schedule.fullMarks}`;
  }
  return null;
}

// ── Student mark row ──────────────────────────────────────────────────────────

const StudentMarkRow = memo(function StudentMarkRow({
  student, state, isSplit, schedule, onChange,
}: {
  student: StudentProfile; state: MarkState; isSplit: boolean; schedule: ExamSchedule; onChange: (studentId: string, next: Partial<MarkState>) => void;
}) {
  const c = useThemeColors();
  const { t } = useLocale('teacher');
  const roll = student.currentEnrollment?.rollNumber;
  const validationError = validateMarks(student.id, state, schedule, isSplit);
  const disabled = state.isAbsent;

  const inputStyle = {
    borderWidth: 1,
    borderColor: validationError ? c.danger : c.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    fontFamily: FONT.semibold,
    color: disabled ? c.mutedForeground : c.foreground,
    backgroundColor: disabled ? c.surfaceMuted : c.surface,
    textAlign: 'center' as const,
    minWidth: 72,
    minHeight: 44,
  };

  return (
    <View className="border-b border-border" style={styles.markRow}>
      <View style={styles.markNameRow}>
        {roll != null && <Text className="text-muted-foreground" style={styles.roll}>{roll}</Text>}
        <View style={styles.flex1}>
          <Text className="text-foreground" style={styles.studentName}>{student.firstName} {student.lastName}</Text>
          <Text className="text-muted-foreground" style={styles.admission}>{student.admissionNumber}</Text>
        </View>
        <View style={styles.absentToggle}>
          <NpText style={[styles.absentLabel, { color: state.isAbsent ? c.danger : c.mutedForeground }]}>{t('marks.absent')}</NpText>
          <Switch
            value={state.isAbsent}
            onValueChange={(val) => onChange(student.id, { isAbsent: val, theory: '', practical: '', marks: '' })}
            trackColor={{ false: c.border, true: '#fecaca' }}
            thumbColor={state.isAbsent ? c.danger : c.surface}
          />
        </View>
      </View>

      {!state.isAbsent && (
        <View style={styles.inputsRow}>
          {isSplit ? (
            <>
              <View style={styles.inputCol}>
                <Text className="text-muted-foreground" style={styles.inputLabel}>Theory /{schedule.theoryMarks}</Text>
                <TextInput style={inputStyle} value={state.theory} onChangeText={(v) => onChange(student.id, { theory: v })} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={c.placeholderIcon} editable={!disabled} />
              </View>
              <View style={styles.inputCol}>
                <Text className="text-muted-foreground" style={styles.inputLabel}>Practical /{schedule.practicalMarks}</Text>
                <TextInput style={inputStyle} value={state.practical} onChangeText={(v) => onChange(student.id, { practical: v })} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={c.placeholderIcon} editable={!disabled} />
              </View>
              <View style={styles.totalCol}>
                <NpText className="text-muted-foreground" style={styles.inputLabel}>{t('marks.total')}</NpText>
                <View className="bg-primary/10" style={styles.totalBox}>
                  <Text className="text-primary" style={styles.totalText}>
                    {(() => {
                      const t = parseFloat(state.theory); const p = parseFloat(state.practical);
                      if (!isNaN(t) && !isNaN(p)) return String(t + p);
                      if (!isNaN(t)) return String(t);
                      if (!isNaN(p)) return String(p);
                      return '—';
                    })()}
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.inputCol}>
              <Text className="text-muted-foreground" style={styles.inputLabel}>Marks /{schedule.fullMarks}</Text>
              <TextInput style={[inputStyle, { minWidth: 120 }]} value={state.marks} onChangeText={(v) => onChange(student.id, { marks: v })} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={c.placeholderIcon} editable={!disabled} />
            </View>
          )}
        </View>
      )}

      {validationError && <Text className="text-danger" style={styles.validationError}>{validationError}</Text>}
    </View>
  );
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function TeacherMarks() {
  const [selectedSchedule, setSelectedSchedule] = useState<ExamSchedule | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [marksMap, setMarksMap] = useState<Record<string, MarkState>>({});
  const touchedRef = useRef<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const c = useThemeColors();
  const { t } = useLocale('teacher');

  const { data: schedules, isLoading: schedulesLoading, isError: schedulesError, refetch: refetchSchedules } = useMyExamSchedules();
  const { data: allSections, isLoading: sectionsLoading, isError: sectionsError, refetch: refetchSections } = useMySections();
  const studentsResult = useSectionStudents(selectedSection);
  const marksResult = useExamMarks(selectedSchedule?.examScheduleId);
  const submitMutation = useBulkSubmitMarks();

  const isSplit = !!(
    selectedSchedule &&
    selectedSchedule.theoryMarks != null && selectedSchedule.theoryMarks > 0 &&
    selectedSchedule.practicalMarks != null && selectedSchedule.practicalMarks > 0
  );

  const filteredSections = useMemo<MySection[]>(() => {
    if (!selectedSchedule || !allSections) return [];
    return allSections.filter((s) => s.classId === selectedSchedule.classId);
  }, [selectedSchedule, allSections]);

  useEffect(() => {
    if (filteredSections.length === 1 && selectedSection !== filteredSections[0].sectionId) {
      setSelectedSection(filteredSections[0].sectionId);
    }
  }, [filteredSections, selectedSection]);

  useEffect(() => {
    if (!studentsResult.data || !marksResult.data) return;
    const existingByStudentId: Record<string, ExamMark> = {};
    marksResult.data.forEach((em) => { existingByStudentId[em.studentId] = em; });
    setMarksMap((prev) => {
      const next: Record<string, MarkState> = {};
      studentsResult.data!.forEach((student) => {
        const existing = existingByStudentId[student.id];
        if (existing && !touchedRef.current.has(student.id)) next[student.id] = prefillMark(existing, isSplit);
        else next[student.id] = prev[student.id] ?? emptyMark();
      });
      return next;
    });
  }, [studentsResult.data, marksResult.data, isSplit]);

  const updateMark = useCallback((studentId: string, patch: Partial<MarkState>) => {
    touchedRef.current.add(studentId);
    setSubmitted(false);
    setMarksMap((prev) => ({ ...prev, [studentId]: { ...(prev[studentId] ?? emptyMark()), ...patch } }));
  }, []);

  const handleSelectSchedule = (schedule: ExamSchedule) => {
    const deselect = selectedSchedule?.examScheduleId === schedule.examScheduleId;
    setSelectedSchedule(deselect ? null : schedule);
    setSelectedSection(null);
    setMarksMap({});
    touchedRef.current.clear();
    setSubmitted(false);
  };

  const handleSelectSection = (id: string) => {
    setSelectedSection(id);
    setMarksMap({});
    touchedRef.current.clear();
    setSubmitted(false);
  };

  const handleSubmit = useCallback(async () => {
    if (!selectedSchedule || !studentsResult.data) return;
    for (const studentId of touchedRef.current) {
      const state = marksMap[studentId];
      if (!state) continue;
      const err = validateMarks(studentId, state, selectedSchedule, isSplit);
      if (err) {
        const student = studentsResult.data.find((s) => s.id === studentId);
        Alert.alert(t('marks.alertValidationTitle'), `${student ? `${student.firstName} ${student.lastName}` : studentId}: ${err}`);
        return;
      }
    }
    const marks: BulkMarkEntry[] = [];
    for (const studentId of touchedRef.current) {
      const state = marksMap[studentId];
      if (!state) continue;
      if (state.isAbsent) { marks.push({ studentId, isAbsent: true, remarks: state.remarks || undefined }); continue; }
      if (isSplit) {
        const t = state.theory !== '' ? parseFloat(state.theory) : undefined;
        const p = state.practical !== '' ? parseFloat(state.practical) : undefined;
        const total = t != null && p != null ? t + p : t ?? p;
        marks.push({ studentId, isAbsent: false, theoryMarks: t, practicalMarks: p, marksObtained: total, remarks: state.remarks || undefined });
      } else {
        const m = state.marks !== '' ? parseFloat(state.marks) : undefined;
        marks.push({ studentId, isAbsent: false, marksObtained: m, remarks: state.remarks || undefined });
      }
    }
    if (marks.length === 0) { Alert.alert(t('marks.alertNothingTitle'), t('marks.alertNothingBody')); return; }
    try {
      await submitMutation.mutateAsync({ examScheduleId: selectedSchedule.examScheduleId, marks });
      setSubmitted(true);
      touchedRef.current.clear();
    } catch {
      Alert.alert(t('marks.alertFailedTitle'), t('marks.alertSaveFailed'));
    }
  }, [selectedSchedule, studentsResult.data, marksMap, isSplit, submitMutation]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetchSchedules();
    setRefreshing(false);
  };

  const rosterReady = !!(selectedSchedule && selectedSection);
  const rosterLoading = studentsResult.isLoading || marksResult.isLoading;
  const students = studentsResult.data ?? [];
  const hasValidationErrors = rosterReady && students.some(
    (s) => validateMarks(s.id, marksMap[s.id] ?? emptyMark(), selectedSchedule!, isSplit) !== null,
  );
  const selectedSec = filteredSections.find((s) => s.sectionId === selectedSection);
  const rosterError = studentsResult.isError || marksResult.isError;
  // Roster rows render as FlatList items (virtualized) — only when ready, loaded and non-empty.
  const showRows = rosterReady && !rosterLoading && !rosterError && students.length > 0;

  return (
    <FlatList
      className="bg-background"
      style={styles.fill}
      data={showRows ? students : []}
      keyExtractor={(item) => item.id}
      extraData={marksMap}
      removeClippedSubviews={false}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      renderItem={({ item, index }) => (
        <View
          style={[
            styles.rowWrap,
            { backgroundColor: c.surface },
            index === students.length - 1 && styles.rosterCardBottom,
            index === students.length - 1 && CARD_SHADOW,
          ]}
        >
          <StudentMarkRow
            student={item}
            state={marksMap[item.id] ?? emptyMark()}
            isSplit={isSplit}
            schedule={selectedSchedule!}
            onChange={updateMark}
          />
        </View>
      )}
      ListHeaderComponent={
        <>
          <ScreenHeader
            variant="plain"
            eyebrow={t('marks.eyebrow')}
            title={selectedSchedule ? `${selectedSchedule.examTypeName} · ${selectedSchedule.subjectName}` : t('marks.selectExam')}
            subtitle={
              selectedSchedule && selectedSec
                ? `${selectedSec.className} · ${selectedSec.sectionName}${isSplit ? ` · Theory ${selectedSchedule.theoryMarks} + Practical ${selectedSchedule.practicalMarks}` : ` · Full marks ${selectedSchedule.fullMarks}`}`
                : undefined
            }
          />

          <View style={styles.headerArea}>
            {/* Step 1 — schedule */}
            <Card padded>
              <CardLabel>Step 1 — Pick an exam schedule</CardLabel>
              {schedulesLoading ? (
                <LoadingBlock />
              ) : schedulesError ? (
                <ErrorState compact title={t('marks.errorExams')} onRetry={() => void refetchSchedules()} />
              ) : !schedules || schedules.length === 0 ? (
                <EmptyState compact icon="calendar-outline" title={t('marks.noExams')} />
              ) : (
                <View style={styles.pickerList}>
                  {schedules.map((s) => {
                    const bsDate = (() => { try { return formatBs(adToBs(new Date(s.examDate)), 'en'); } catch { return s.examDate; } })();
                    return (
                      <SelectableRow
                        key={s.examScheduleId}
                        title={`${s.examTypeName} · ${s.subjectName}`}
                        subtitle={`${s.className} · ${bsDate}`}
                        selected={selectedSchedule?.examScheduleId === s.examScheduleId}
                        onPress={() => handleSelectSchedule(s)}
                        right={
                          <View style={styles.fullMarksCol}>
                            <Text className="text-primary" style={styles.fullMarksNum}>{s.fullMarks}</Text>
                            <NpText className="text-muted-foreground" style={styles.fullMarksLabel}>{t('marks.full')}</NpText>
                          </View>
                        }
                      />
                    );
                  })}
                </View>
              )}
            </Card>

            {/* Step 2 — section */}
            {selectedSchedule && (
              <Card padded>
                <CardLabel>Step 2 — Pick a section</CardLabel>
                {sectionsLoading ? (
                  <LoadingBlock />
                ) : sectionsError ? (
                  <ErrorState compact title={t('marks.errorSections')} onRetry={() => void refetchSections()} />
                ) : filteredSections.length === 0 ? (
                  <NpText className="text-muted-foreground" style={styles.hint}>{t('marks.noSectionsForClass')}</NpText>
                ) : (
                  <View style={styles.pickerList}>
                    {filteredSections.map((s) => (
                      <SelectableRow
                        key={s.sectionId}
                        title={`${s.className} · ${s.sectionName}`}
                        selected={selectedSection === s.sectionId}
                        onPress={() => handleSelectSection(s.sectionId)}
                      />
                    ))}
                  </View>
                )}
              </Card>
            )}

            {/* Step 3 — marks: card header + non-row states (rows render below as FlatList items) */}
            {rosterReady && (
              <View
                style={[
                  styles.rosterCardTop,
                  CARD_SHADOW,
                  { backgroundColor: c.surface },
                  !showRows && styles.rosterCardBottom,
                ]}
              >
                <View className="border-b border-border" style={styles.listHeader}>
                  <CardLabel>Step 3 — Enter marks</CardLabel>
                  {isSplit && (
                    <View className="bg-primary/10" style={styles.splitPill}>
                      <Text className="text-primary" style={styles.splitPillText}>Theory + Practical</Text>
                    </View>
                  )}
                </View>
                {rosterLoading ? (
                  <LoadingBlock label={t('marks.loadingStudents')} />
                ) : rosterError ? (
                  <ErrorState
                    compact
                    title={t('marks.errorStudents')}
                    onRetry={() => { void studentsResult.refetch(); void marksResult.refetch(); }}
                  />
                ) : students.length === 0 ? (
                  <EmptyState compact icon="people-outline" title={t('marks.noStudents')} />
                ) : null}
              </View>
            )}
          </View>
        </>
      }
      ListFooterComponent={
        <View style={styles.footerArea}>
          {rosterReady && students.length > 0 && !rosterLoading && !rosterError && (
            submitted ? (
              <View style={styles.savedBanner}>
                <Ionicons name="checkmark-circle" size={22} color={STATUS_CONFIG.PRESENT.color} />
                <NpText style={styles.savedText}>{t('marks.saved')}</NpText>
              </View>
            ) : (
              <PrimaryButton
                label={
                  submitMutation.isPending ? t('marks.saving')
                    : hasValidationErrors ? 'Fix errors above'
                    : t('marks.saveWithCount', { count: touchedRef.current.size })
                }
                icon="save"
                loading={submitMutation.isPending}
                disabled={hasValidationErrors}
                onPress={handleSubmit}
              />
            )
          )}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex1: { flex: 1 },
  // FlatList header area (steps 1–3 header) + footer area (submit). The roster rows
  // render as virtualized items between them; the step-3 card is split into a rounded
  // top (here) + surface rows + a rounded last row so it reads as one continuous card.
  headerArea: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  footerArea: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  rosterCardTop: { borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
  rosterCardBottom: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden' },
  rowWrap: { marginHorizontal: 16 },
  hint: { fontSize: 13 },
  pickerList: { gap: 8 },
  fullMarksCol: { alignItems: 'flex-end', marginLeft: 8 },
  fullMarksNum: { fontSize: 13, fontFamily: FONT.bold },
  fullMarksLabel: { fontSize: 10 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 12 },
  splitPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 12 },
  splitPillText: { fontSize: 11, fontFamily: FONT.bold },
  // mark row
  markRow: { paddingVertical: 12, paddingHorizontal: 14 },
  markNameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  roll: { fontSize: 12, width: 28, fontFamily: FONT.semibold },
  studentName: { fontSize: 14, fontFamily: FONT.semibold },
  admission: { fontSize: 11 },
  absentToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  absentLabel: { fontSize: 11, fontFamily: FONT.semibold },
  inputsRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  inputCol: { alignItems: 'center', flex: 1 },
  totalCol: { alignItems: 'center' },
  inputLabel: { fontSize: 10, fontFamily: FONT.bold, marginBottom: 4, textTransform: 'uppercase' },
  totalBox: { minWidth: 64, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  totalText: { fontSize: 14, fontFamily: FONT.bold },
  validationError: { fontSize: 11, marginTop: 6, fontFamily: FONT.semibold },
  savedBanner: { backgroundColor: STATUS_CONFIG.PRESENT.bg, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  savedText: { color: STATUS_CONFIG.PRESENT.color, fontSize: 15, fontFamily: FONT.bold },
});
