import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, RefreshControl, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, useMemo, useCallback, useRef } from 'react';
import {
  useMyExamSchedules,
  useMySections,
  useSectionStudents,
  useExamMarks,
  useBulkSubmitMarks,
} from '../../hooks/useTeacher';
import { adToBs, formatBs } from 'bs-calendar';
import type { ExamSchedule, MySection, StudentProfile, ExamMark, BulkMarkEntry } from '../../types';

// ─── Per-student mark state ───────────────────────────────────────────────────

interface MarkState {
  theory: string;
  practical: string;
  marks: string;
  isAbsent: boolean;
  remarks: string;
}

function emptyMark(): MarkState {
  return { theory: '', practical: '', marks: '', isAbsent: false, remarks: '' };
}

function prefillMark(em: ExamMark, isSplit: boolean): MarkState {
  if (em.isAbsent) {
    return { theory: '', practical: '', marks: '', isAbsent: true, remarks: em.remarks ?? '' };
  }
  if (isSplit) {
    return {
      theory: em.theoryMarks != null ? String(em.theoryMarks) : '',
      practical: em.practicalMarks != null ? String(em.practicalMarks) : '',
      marks: '',
      isAbsent: false,
      remarks: em.remarks ?? '',
    };
  }
  return {
    theory: '',
    practical: '',
    marks: em.marksObtained != null ? String(em.marksObtained) : '',
    isAbsent: false,
    remarks: em.remarks ?? '',
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateMarks(
  studentId: string,
  state: MarkState,
  schedule: ExamSchedule,
  isSplit: boolean,
): string | null {
  if (state.isAbsent) return null;
  if (isSplit) {
    const theoryFilled = state.theory !== '';
    const practicalFilled = state.practical !== '';
    if (theoryFilled !== practicalFilled) {
      return 'Enter both theory and practical, or mark absent';
    }
    const t = parseFloat(state.theory);
    const p = parseFloat(state.practical);
    if (theoryFilled && (isNaN(t) || t < 0 || t > (schedule.theoryMarks ?? 0))) {
      return `Theory marks must be between 0 and ${schedule.theoryMarks}`;
    }
    if (practicalFilled && (isNaN(p) || p < 0 || p > (schedule.practicalMarks ?? 0))) {
      return `Practical marks must be between 0 and ${schedule.practicalMarks}`;
    }
  } else {
    const m = parseFloat(state.marks);
    if (state.marks !== '' && (isNaN(m) || m < 0 || m > schedule.fullMarks)) {
      return `Marks must be between 0 and ${schedule.fullMarks}`;
    }
  }
  return null;
}

// ─── Schedule chip ─────────────────────────────────────────────────────────────

function ScheduleChip({
  schedule,
  selected,
  onPress,
}: {
  schedule: ExamSchedule;
  selected: boolean;
  onPress: () => void;
}) {
  const bsDate = useMemo(() => {
    try { return formatBs(adToBs(new Date(schedule.examDate)), 'en'); }
    catch { return schedule.examDate; }
  }, [schedule.examDate]);

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        padding: 14, borderRadius: 14, borderWidth: 1.5,
        borderColor: selected ? '#1e40af' : '#e5e7eb',
        backgroundColor: selected ? '#eff6ff' : 'white',
        marginBottom: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>
            {schedule.examTypeName} · {schedule.subjectName}
          </Text>
          <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
            {schedule.className} · {bsDate}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#1e40af' }}>
            {schedule.fullMarks}
          </Text>
          <Text style={{ fontSize: 10, color: '#9ca3af' }}>Full</Text>
        </View>
        {selected && (
          <Ionicons name="checkmark-circle" size={20} color="#1e40af" style={{ marginLeft: 8 }} />
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Section picker ───────────────────────────────────────────────────────────

function SectionPicker({
  sections,
  selected,
  onSelect,
}: {
  sections: MySection[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (sections.length === 0) {
    return (
      <Text style={{ color: '#9ca3af', fontSize: 13 }}>
        You have no sections assigned to this class.
      </Text>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      {sections.map((s) => (
        <TouchableOpacity
          key={s.sectionId}
          onPress={() => onSelect(s.sectionId)}
          style={{
            flexDirection: 'row', alignItems: 'center', padding: 14,
            borderRadius: 14, borderWidth: 1.5,
            borderColor: selected === s.sectionId ? '#1e40af' : '#e5e7eb',
            backgroundColor: selected === s.sectionId ? '#eff6ff' : 'white',
          }}
        >
          <View style={{
            width: 20, height: 20, borderRadius: 10, borderWidth: 2,
            borderColor: selected === s.sectionId ? '#1e40af' : '#d1d5db',
            alignItems: 'center', justifyContent: 'center', marginRight: 12,
          }}>
            {selected === s.sectionId && (
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#1e40af' }} />
            )}
          </View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>
            {s.className} · {s.sectionName}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Student mark row ─────────────────────────────────────────────────────────

function StudentMarkRow({
  student,
  state,
  isSplit,
  schedule,
  onChange,
}: {
  student: StudentProfile;
  state: MarkState;
  isSplit: boolean;
  schedule: ExamSchedule;
  onChange: (next: Partial<MarkState>) => void;
}) {
  const roll = student.currentEnrollment?.rollNumber;
  const validationError = validateMarks(student.id, state, schedule, isSplit);
  const inputDisabled = state.isAbsent;

  const inputStyle = {
    borderWidth: 1,
    borderColor: validationError ? '#ef4444' : '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '600' as const,
    color: inputDisabled ? '#9ca3af' : '#111827',
    backgroundColor: inputDisabled ? '#f9fafb' : 'white',
    textAlign: 'center' as const,
    minWidth: 72,
  };

  return (
    <View style={{
      paddingVertical: 12, paddingHorizontal: 14,
      borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
    }}>
      {/* Name row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        {roll != null && (
          <Text style={{ fontSize: 12, color: '#9ca3af', width: 28, fontWeight: '600' }}>
            {roll}
          </Text>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>
            {student.firstName} {student.lastName}
          </Text>
          <Text style={{ fontSize: 11, color: '#9ca3af' }}>{student.admissionNumber}</Text>
        </View>
        {/* Absent toggle */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 11, color: state.isAbsent ? '#dc2626' : '#9ca3af', fontWeight: '600' }}>
            Absent
          </Text>
          <Switch
            value={state.isAbsent}
            onValueChange={(val) => onChange({ isAbsent: val, theory: '', practical: '', marks: '' })}
            trackColor={{ false: '#e5e7eb', true: '#fecaca' }}
            thumbColor={state.isAbsent ? '#dc2626' : '#f3f4f6'}
          />
        </View>
      </View>

      {/* Inputs row */}
      {!state.isAbsent && (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          {isSplit ? (
            <>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' }}>
                  Theory /{schedule.theoryMarks}
                </Text>
                <TextInput
                  style={inputStyle}
                  value={state.theory}
                  onChangeText={(v) => onChange({ theory: v })}
                  keyboardType="decimal-pad"
                  placeholder="—"
                  placeholderTextColor="#d1d5db"
                  editable={!inputDisabled}
                />
              </View>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' }}>
                  Practical /{schedule.practicalMarks}
                </Text>
                <TextInput
                  style={inputStyle}
                  value={state.practical}
                  onChangeText={(v) => onChange({ practical: v })}
                  keyboardType="decimal-pad"
                  placeholder="—"
                  placeholderTextColor="#d1d5db"
                  editable={!inputDisabled}
                />
              </View>
              {/* Computed total */}
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' }}>
                  Total
                </Text>
                <View style={{
                  minWidth: 64, height: 40, borderRadius: 10, backgroundColor: '#f0f9ff',
                  alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10,
                }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#0369a1' }}>
                    {(() => {
                      const t = parseFloat(state.theory);
                      const p = parseFloat(state.practical);
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
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' }}>
                Marks /{schedule.fullMarks}
              </Text>
              <TextInput
                style={[inputStyle, { minWidth: 120 }]}
                value={state.marks}
                onChangeText={(v) => onChange({ marks: v })}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor="#d1d5db"
                editable={!inputDisabled}
              />
            </View>
          )}
        </View>
      )}

      {/* Validation error */}
      {validationError && (
        <Text style={{ fontSize: 11, color: '#dc2626', marginTop: 6, fontWeight: '600' }}>
          {validationError}
        </Text>
      )}
    </View>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={[{
      backgroundColor: 'white', borderRadius: 20, overflow: 'hidden',
      shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
    }, style]}>
      {children}
    </View>
  );
}

function CardHeader({ label }: { label: string }) {
  return (
    <Text style={{
      fontSize: 11, color: '#6b7280', fontWeight: '700',
      textTransform: 'uppercase', letterSpacing: 0.8,
      paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    }}>
      {label}
    </Text>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function TeacherMarks() {
  const [selectedSchedule, setSelectedSchedule] = useState<ExamSchedule | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [marksMap, setMarksMap] = useState<Record<string, MarkState>>({});
  const touchedRef = useRef<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data: schedules, isLoading: schedulesLoading, refetch: refetchSchedules } = useMyExamSchedules();
  const { data: allSections, isLoading: sectionsLoading } = useMySections();
  const studentsResult = useSectionStudents(selectedSection);
  const marksResult = useExamMarks(selectedSchedule?.examScheduleId);
  const submitMutation = useBulkSubmitMarks();

  const isSplit = !!(
    selectedSchedule &&
    selectedSchedule.theoryMarks != null && selectedSchedule.theoryMarks > 0 &&
    selectedSchedule.practicalMarks != null && selectedSchedule.practicalMarks > 0
  );

  // Sections filtered to the selected schedule's classId
  const filteredSections = useMemo<MySection[]>(() => {
    if (!selectedSchedule || !allSections) return [];
    return allSections.filter((s) => s.classId === selectedSchedule.classId);
  }, [selectedSchedule, allSections]);

  // Auto-select when exactly one section matches
  useMemo(() => {
    if (filteredSections.length === 1 && selectedSection !== filteredSections[0].sectionId) {
      setSelectedSection(filteredSections[0].sectionId);
    }
  }, [filteredSections]);

  // Merge existing marks into marksMap when both queries resolve
  useMemo(() => {
    if (!studentsResult.data || !marksResult.data) return;
    const existingByStudentId: Record<string, ExamMark> = {};
    marksResult.data.forEach((em) => { existingByStudentId[em.studentId] = em; });

    setMarksMap((prev) => {
      const next: Record<string, MarkState> = {};
      studentsResult.data!.forEach((student) => {
        const existing = existingByStudentId[student.id];
        if (existing && !touchedRef.current.has(student.id)) {
          next[student.id] = prefillMark(existing, isSplit);
        } else {
          next[student.id] = prev[student.id] ?? emptyMark();
        }
      });
      return next;
    });
  }, [studentsResult.data, marksResult.data, isSplit]);

  const updateMark = useCallback((studentId: string, patch: Partial<MarkState>) => {
    touchedRef.current.add(studentId);
    setSubmitted(false);
    setMarksMap((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] ?? emptyMark()), ...patch },
    }));
  }, []);

  const handleSelectSchedule = (schedule: ExamSchedule) => {
    if (selectedSchedule?.examScheduleId === schedule.examScheduleId) {
      // deselect — reset everything
      setSelectedSchedule(null);
      setSelectedSection(null);
      setMarksMap({});
      touchedRef.current.clear();
      setSubmitted(false);
      return;
    }
    setSelectedSchedule(schedule);
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

    // Validate touched students
    for (const studentId of touchedRef.current) {
      const state = marksMap[studentId];
      if (!state) continue;
      const err = validateMarks(studentId, state, selectedSchedule, isSplit);
      if (err) {
        const student = studentsResult.data.find((s) => s.id === studentId);
        const name = student ? `${student.firstName} ${student.lastName}` : studentId;
        Alert.alert('Validation error', `${name}: ${err}`);
        return;
      }
    }

    // Build payload — only touched students
    const marks: BulkMarkEntry[] = [];
    for (const studentId of touchedRef.current) {
      const state = marksMap[studentId];
      if (!state) continue;

      if (state.isAbsent) {
        marks.push({ studentId, isAbsent: true, remarks: state.remarks || undefined });
        continue;
      }

      if (isSplit) {
        const t = state.theory !== '' ? parseFloat(state.theory) : undefined;
        const p = state.practical !== '' ? parseFloat(state.practical) : undefined;
        const total = t != null && p != null ? t + p : t ?? p;
        marks.push({
          studentId,
          isAbsent: false,
          theoryMarks: t,
          practicalMarks: p,
          marksObtained: total,
          remarks: state.remarks || undefined,
        });
      } else {
        const m = state.marks !== '' ? parseFloat(state.marks) : undefined;
        marks.push({
          studentId,
          isAbsent: false,
          marksObtained: m,
          remarks: state.remarks || undefined,
        });
      }
    }

    if (marks.length === 0) {
      Alert.alert('Nothing to save', 'Make a change before submitting.');
      return;
    }

    try {
      await submitMutation.mutateAsync({ examScheduleId: selectedSchedule.examScheduleId, marks });
      setSubmitted(true);
      touchedRef.current.clear();
    } catch {
      Alert.alert('Failed', 'Could not save marks. Please try again.');
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
    (s) => validateMarks(s.id, marksMap[s.id] ?? emptyMark(), selectedSchedule!, isSplit) !== null
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f9fafb' }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1e40af" />}
    >
      {/* Header */}
      <LinearGradient
        colors={['#1e3a8a', '#1e40af', '#2563eb']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: 56, paddingBottom: 28, paddingHorizontal: 20 }}
      >
        <Text style={{
          color: '#bfdbfe', fontSize: 12, fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
        }}>
          Marks Entry
        </Text>
        <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 4 }}>
          {selectedSchedule
            ? `${selectedSchedule.examTypeName} · ${selectedSchedule.subjectName}`
            : 'Select an exam'}
        </Text>
        {selectedSchedule && selectedSection && (() => {
          const sec = filteredSections.find((s) => s.sectionId === selectedSection);
          return sec ? (
            <Text style={{ color: '#93c5fd', fontSize: 13 }}>
              {sec.className} · {sec.sectionName}
              {isSplit ? ` · Theory ${selectedSchedule.theoryMarks} + Practical ${selectedSchedule.practicalMarks}` : ` · Full marks ${selectedSchedule.fullMarks}`}
            </Text>
          ) : null;
        })()}
      </LinearGradient>

      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, gap: 12 }}>

        {/* Card 1 — Schedule picker */}
        <Card>
          <CardHeader label="Step 1 — Pick an exam schedule" />
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            {schedulesLoading ? (
              <ActivityIndicator size="small" color="#1e40af" />
            ) : !schedules || schedules.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <Ionicons name="calendar-outline" size={36} color="#d1d5db" />
                <Text style={{ color: '#9ca3af', marginTop: 8, fontSize: 13, textAlign: 'center' }}>
                  No exam schedules assigned to you.
                </Text>
              </View>
            ) : (
              schedules.map((s) => (
                <ScheduleChip
                  key={s.examScheduleId}
                  schedule={s}
                  selected={selectedSchedule?.examScheduleId === s.examScheduleId}
                  onPress={() => handleSelectSchedule(s)}
                />
              ))
            )}
          </View>
        </Card>

        {/* Card 2 — Section picker (only after schedule chosen) */}
        {selectedSchedule && (
          <Card>
            <CardHeader label="Step 2 — Pick a section" />
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              {sectionsLoading ? (
                <ActivityIndicator size="small" color="#1e40af" />
              ) : (
                <SectionPicker
                  sections={filteredSections}
                  selected={selectedSection}
                  onSelect={handleSelectSection}
                />
              )}
            </View>
          </Card>
        )}

        {/* Card 3 — Roster + marks entry */}
        {rosterReady && (
          <Card>
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
              borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
            }}>
              <Text style={{
                fontSize: 11, color: '#6b7280', fontWeight: '700',
                textTransform: 'uppercase', letterSpacing: 0.8,
              }}>
                Step 3 — Enter marks
              </Text>
              {isSplit && (
                <View style={{
                  flexDirection: 'row', gap: 6,
                  backgroundColor: '#eff6ff', borderRadius: 10,
                  paddingHorizontal: 8, paddingVertical: 3,
                }}>
                  <Text style={{ fontSize: 11, color: '#1e40af', fontWeight: '700' }}>
                    Theory + Practical
                  </Text>
                </View>
              )}
            </View>

            {rosterLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <ActivityIndicator size="small" color="#1e40af" />
                <Text style={{ color: '#9ca3af', marginTop: 8, fontSize: 13 }}>
                  Loading students...
                </Text>
              </View>
            ) : students.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Ionicons name="people-outline" size={36} color="#d1d5db" />
                <Text style={{ color: '#9ca3af', marginTop: 8, fontSize: 13 }}>
                  No students found in this section.
                </Text>
              </View>
            ) : (
              students.map((student) => (
                <StudentMarkRow
                  key={student.id}
                  student={student}
                  state={marksMap[student.id] ?? emptyMark()}
                  isSplit={isSplit}
                  schedule={selectedSchedule!}
                  onChange={(patch) => updateMark(student.id, patch)}
                />
              ))
            )}
          </Card>
        )}

        {/* Submit */}
        {rosterReady && students.length > 0 && !rosterLoading && (
          submitted ? (
            <View style={{
              backgroundColor: '#d1fae5', borderRadius: 20, padding: 16,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <Ionicons name="checkmark-circle" size={22} color="#065f46" />
              <Text style={{ color: '#065f46', fontSize: 15, fontWeight: '700' }}>
                Marks saved successfully
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitMutation.isPending || hasValidationErrors}
              style={{
                backgroundColor: hasValidationErrors
                  ? '#fca5a5'
                  : submitMutation.isPending
                  ? '#93c5fd'
                  : '#1e40af',
                borderRadius: 20, padding: 18,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {submitMutation.isPending ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="save-outline" size={20} color="white" />
              )}
              <Text style={{ color: 'white', fontSize: 15, fontWeight: '800' }}>
                {submitMutation.isPending
                  ? 'Saving...'
                  : hasValidationErrors
                  ? 'Fix errors above'
                  : `Save Marks (${touchedRef.current.size} changed)`}
              </Text>
            </TouchableOpacity>
          )
        )}

      </View>
    </ScrollView>
  );
}
