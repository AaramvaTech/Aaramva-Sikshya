import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, useMemo, useCallback } from 'react';
import {
  useMySections,
  useSectionStudents,
  useSectionAttendance,
  useBulkMarkAttendance,
} from '../../hooks/useTeacher';
import { todayBs, bsToAd, formatBs } from 'bs-calendar';
import type { BsDate } from 'bs-calendar';
import type { MySection, StudentProfile, SectionAttendanceRecord } from '../../types';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE';

const STATUS_OPTIONS: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE'];

const STATUS_STYLE: Record<AttendanceStatus, { bg: string; text: string; label: string }> = {
  PRESENT: { bg: '#d1fae5', text: '#065f46', label: 'P' },
  ABSENT:  { bg: '#fee2e2', text: '#991b1b', label: 'A' },
  LATE:    { bg: '#fef3c7', text: '#92400e', label: 'L' },
};

function todayAdString(): string {
  const offset = 5 * 60 + 45;
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const nepal = new Date(utcMs + offset * 60000);
  return nepal.toISOString().split('T')[0];
}

function adStringFromBs(bs: BsDate): string {
  return bsToAd(bs).toISOString().split('T')[0];
}

function prevMonth(b: BsDate): BsDate {
  if (b.month === 1) return { year: b.year - 1, month: 12, day: 1 };
  return { year: b.year, month: b.month - 1, day: 1 };
}
function nextMonth(b: BsDate): BsDate {
  if (b.month === 12) return { year: b.year + 1, month: 1, day: 1 };
  return { year: b.year, month: b.month + 1, day: 1 };
}

// ─── Section picker ────────────────────────────────────────────────────────────

function SectionPicker({
  sections,
  selected,
  onSelect,
}: {
  sections: MySection[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
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
          <View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>
              {s.className} · {s.sectionName}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Date picker (BS month nav + simple day selector) ─────────────────────────

function DateSelector({
  selectedBs,
  onSelect,
}: {
  selectedBs: BsDate;
  onSelect: (bs: BsDate) => void;
}) {
  const [viewMonth, setViewMonth] = useState<BsDate>({ year: selectedBs.year, month: selectedBs.month, day: 1 });

  const { daysInMonth } = useMemo(() => {
    const { daysInBsMonth } = require('bs-calendar');
    return { daysInMonth: daysInBsMonth(viewMonth.year, viewMonth.month) as number };
  }, [viewMonth.year, viewMonth.month]);

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <View>
      {/* Month nav */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <TouchableOpacity onPress={() => setViewMonth(prevMonth(viewMonth))} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={20} color="#1e40af" />
        </TouchableOpacity>
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>
          {require('bs-calendar').BS_MONTH_NAMES_EN[viewMonth.month - 1]} {viewMonth.year}
        </Text>
        <TouchableOpacity onPress={() => setViewMonth(nextMonth(viewMonth))} style={{ padding: 6 }}>
          <Ionicons name="chevron-forward" size={20} color="#1e40af" />
        </TouchableOpacity>
      </View>
      {/* Day row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {days.map((d) => {
          const isSelected = selectedBs.year === viewMonth.year &&
            selectedBs.month === viewMonth.month && selectedBs.day === d;
          return (
            <TouchableOpacity
              key={d}
              onPress={() => onSelect({ year: viewMonth.year, month: viewMonth.month, day: d })}
              style={{
                width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isSelected ? '#1e40af' : '#f3f4f6',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: isSelected ? 'white' : '#374151' }}>
                {d}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Student toggle row ────────────────────────────────────────────────────────

function StudentRow({
  student,
  status,
  onCycle,
}: {
  student: StudentProfile;
  status: AttendanceStatus;
  onCycle: () => void;
}) {
  const cfg = STATUS_STYLE[status];
  const roll = student.currentEnrollment?.rollNumber;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
      paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
    }}>
      {roll !== null && roll !== undefined && (
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
      <TouchableOpacity
        onPress={onCycle}
        style={{
          width: 40, height: 40, borderRadius: 12,
          backgroundColor: cfg.bg, alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: '800', color: cfg.text }}>{cfg.label}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function TeacherAttendance() {
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [showAllSections, setShowAllSections] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const initBs = todayBs();
  const [selectedBs, setSelectedBs] = useState<BsDate>(initBs);
  const selectedDateAd = useMemo(() => adStringFromBs(selectedBs), [selectedBs]);

  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>({});

  const { data: mySections, isLoading: sectionsLoading, refetch: refetchSections } = useMySections();
  const studentsResult = useSectionStudents(selectedSection);
  const existingResult = useSectionAttendance(selectedSection, selectedDateAd);
  const markMutation = useBulkMarkAttendance();

  // Pre-fill statusMap when existing attendance loads
  useMemo(() => {
    if (!existingResult.data) return;
    const map: Record<string, AttendanceStatus> = {};
    existingResult.data.forEach((rec: SectionAttendanceRecord) => {
      const s = rec.status as AttendanceStatus;
      if (STATUS_OPTIONS.includes(s)) map[rec.studentId] = s;
    });
    setStatusMap(map);
  }, [existingResult.data]);

  // Default all students to PRESENT when student list loads (unless overridden)
  useMemo(() => {
    if (!studentsResult.data) return;
    setStatusMap((prev) => {
      const next = { ...prev };
      studentsResult.data!.forEach((s) => {
        if (!next[s.id]) next[s.id] = 'PRESENT';
      });
      return next;
    });
  }, [studentsResult.data]);

  const cycleStatus = useCallback((studentId: string) => {
    setStatusMap((prev) => {
      const curr = prev[studentId] ?? 'PRESENT';
      const idx = STATUS_OPTIONS.indexOf(curr);
      const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
      return { ...prev, [studentId]: next };
    });
    setSubmitted(false);
  }, []);

  const markAllPresent = useCallback(() => {
    if (!studentsResult.data) return;
    const map: Record<string, AttendanceStatus> = {};
    studentsResult.data.forEach((s) => { map[s.id] = 'PRESENT'; });
    setStatusMap(map);
    setSubmitted(false);
  }, [studentsResult.data]);

  const handleSubmit = useCallback(async () => {
    if (!selectedSection || !studentsResult.data) return;
    const academicYearId = studentsResult.data[0]?.currentEnrollment?.academicYearId;
    if (!academicYearId) {
      Alert.alert('Error', 'No active academic year found for this section.');
      return;
    }
    const records = studentsResult.data.map((s) => ({
      studentId: s.id,
      status: statusMap[s.id] ?? 'PRESENT',
    }));
    try {
      await markMutation.mutateAsync({
        sectionId: selectedSection,
        academicYearId,
        date: selectedDateAd,
        records,
      });
      setSubmitted(true);
    } catch {
      Alert.alert('Failed', 'Could not save attendance. Please try again.');
    }
  }, [selectedSection, studentsResult.data, statusMap, selectedDateAd, markMutation]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetchSections();
    setRefreshing(false);
  };

  const sections = mySections ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f9fafb' }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1e40af" />}
    >
      {/* Header */}
      <LinearGradient
        colors={['#1e3a8a', '#1e40af', '#2563eb']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: 56, paddingBottom: 28, paddingHorizontal: 20 }}
      >
        <Text style={{ color: '#bfdbfe', fontSize: 12, fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          Mark Attendance
        </Text>
        <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 4 }}>
          {formatBs(selectedBs, 'en')}
        </Text>
        {selectedSection && (() => {
          const sec = sections.find((s) => s.sectionId === selectedSection);
          return sec ? (
            <Text style={{ color: '#93c5fd', fontSize: 13 }}>
              {sec.className} · {sec.sectionName}
            </Text>
          ) : null;
        })()}
      </LinearGradient>

      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, gap: 12 }}>

        {/* Section picker */}
        <View style={{
          backgroundColor: 'white', borderRadius: 20, padding: 16,
          shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
        }}>
          <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '700',
            textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
            {showAllSections ? 'All Sections' : 'My Sections'}
          </Text>
          {sectionsLoading ? (
            <ActivityIndicator size="small" color="#1e40af" />
          ) : sections.length === 0 && !showAllSections ? (
            <Text style={{ color: '#9ca3af', fontSize: 13 }}>
              No sections assigned. Use "Mark a different section" below.
            </Text>
          ) : (
            <SectionPicker
              sections={sections}
              selected={selectedSection}
              onSelect={(id) => { setSelectedSection(id); setStatusMap({}); setSubmitted(false); }}
            />
          )}
          <TouchableOpacity
            onPress={() => setShowAllSections(!showAllSections)}
            style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Ionicons
              name={showAllSections ? 'chevron-up' : 'swap-horizontal-outline'}
              size={14} color="#6b7280"
            />
            <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: '600' }}>
              {showAllSections ? 'Show my sections only' : 'Mark a different section'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Date picker */}
        <View style={{
          backgroundColor: 'white', borderRadius: 20, padding: 16,
          shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
        }}>
          <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '700',
            textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
            Date (BS)
          </Text>
          <DateSelector
            selectedBs={selectedBs}
            onSelect={(bs) => { setSelectedBs(bs); setStatusMap({}); setSubmitted(false); }}
          />
          <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
            AD: {selectedDateAd}
          </Text>
        </View>

        {/* Student list */}
        {selectedSection && (
          <View style={{
            backgroundColor: 'white', borderRadius: 20, overflow: 'hidden',
            shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between',
              alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
              <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '700',
                textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Students
              </Text>
              <TouchableOpacity onPress={markAllPresent} style={{
                backgroundColor: '#d1fae5', borderRadius: 10,
                paddingHorizontal: 10, paddingVertical: 4,
              }}>
                <Text style={{ fontSize: 11, color: '#065f46', fontWeight: '700' }}>
                  All Present
                </Text>
              </TouchableOpacity>
            </View>

            {studentsResult.isLoading || existingResult.isLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <ActivityIndicator size="small" color="#1e40af" />
                <Text style={{ color: '#9ca3af', marginTop: 8, fontSize: 13 }}>Loading students...</Text>
              </View>
            ) : !studentsResult.data || studentsResult.data.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Ionicons name="people-outline" size={36} color="#d1d5db" />
                <Text style={{ color: '#9ca3af', marginTop: 8, fontSize: 13 }}>
                  No students found in this section.
                </Text>
              </View>
            ) : (
              studentsResult.data.map((student) => (
                <StudentRow
                  key={student.id}
                  student={student}
                  status={statusMap[student.id] ?? 'PRESENT'}
                  onCycle={() => cycleStatus(student.id)}
                />
              ))
            )}

            {/* Status legend */}
            {studentsResult.data && studentsResult.data.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 12, padding: 14,
                borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
                {STATUS_OPTIONS.map((s) => {
                  const cfg = STATUS_STYLE[s];
                  return (
                    <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: cfg.bg,
                        alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: cfg.text }}>{cfg.label}</Text>
                      </View>
                      <Text style={{ fontSize: 11, color: '#6b7280' }}>{s}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Submit button */}
        {selectedSection && studentsResult.data && studentsResult.data.length > 0 && (
          submitted ? (
            <View style={{
              backgroundColor: '#d1fae5', borderRadius: 20, padding: 16,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <Ionicons name="checkmark-circle" size={22} color="#065f46" />
              <Text style={{ color: '#065f46', fontSize: 15, fontWeight: '700' }}>
                Attendance saved successfully
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={markMutation.isPending}
              style={{
                backgroundColor: markMutation.isPending ? '#93c5fd' : '#1e40af',
                borderRadius: 20, padding: 18,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {markMutation.isPending ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="save-outline" size={20} color="white" />
              )}
              <Text style={{ color: 'white', fontSize: 15, fontWeight: '800' }}>
                {markMutation.isPending ? 'Saving...' : `Save Attendance (${studentsResult.data.length})`}
              </Text>
            </TouchableOpacity>
          )
        )}

      </View>
    </ScrollView>
  );
}
