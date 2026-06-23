import {
  View, Text, ScrollView, TouchableOpacity, Alert, RefreshControl, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  useMySections, useSectionStudents, useSectionAttendance, useBulkMarkAttendance,
} from '../../hooks/useTeacher';
import { todayBs, bsToAd, formatBs, daysInBsMonth, BS_MONTH_NAMES_EN } from 'bs-calendar';
import type { BsDate } from 'bs-calendar';
import type { StudentProfile, SectionAttendanceRecord } from '../../types';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import { STATUS_CONFIG } from '../../lib/attendance';
import {
  ScreenHeader, Card, CardLabel, PrimaryButton, SelectableRow, EmptyState, LoadingBlock,
} from '../../components/ui';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE';
const STATUS_OPTIONS: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE'];

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

// ── Date selector ─────────────────────────────────────────────────────────────

function DateSelector({ selectedBs, onSelect }: { selectedBs: BsDate; onSelect: (bs: BsDate) => void }) {
  const c = useThemeColors();
  const [viewMonth, setViewMonth] = useState<BsDate>({ year: selectedBs.year, month: selectedBs.month, day: 1 });
  const days = useMemo(() => {
    const n = daysInBsMonth(viewMonth.year, viewMonth.month);
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [viewMonth.year, viewMonth.month]);

  return (
    <View>
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => setViewMonth(prevMonth(viewMonth))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={20} color={c.primary} />
        </TouchableOpacity>
        <Text className="text-foreground" style={styles.monthLabel}>
          {BS_MONTH_NAMES_EN[viewMonth.month - 1]} {viewMonth.year}
        </Text>
        <TouchableOpacity onPress={() => setViewMonth(nextMonth(viewMonth))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={20} color={c.primary} />
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
        {days.map((d) => {
          const selected = selectedBs.year === viewMonth.year && selectedBs.month === viewMonth.month && selectedBs.day === d;
          return (
            <TouchableOpacity
              key={d}
              onPress={() => onSelect({ year: viewMonth.year, month: viewMonth.month, day: d })}
              activeOpacity={0.8}
              accessibilityState={{ selected }}
              className={selected ? 'bg-primary' : 'bg-surface-muted'}
              style={styles.dayBtn}
            >
              <Text className={selected ? 'text-primary-foreground' : 'text-foreground'} style={styles.dayBtnText}>{d}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Student toggle row ────────────────────────────────────────────────────────

function StudentRow({ student, status, onCycle }: { student: StudentProfile; status: AttendanceStatus; onCycle: () => void }) {
  const cfg = STATUS_CONFIG[status];
  const roll = student.currentEnrollment?.rollNumber;
  return (
    <View className="border-b border-border" style={styles.studentRow}>
      {roll !== null && roll !== undefined && (
        <Text className="text-muted-foreground" style={styles.roll}>{roll}</Text>
      )}
      <View style={styles.studentInfo}>
        <Text className="text-foreground" style={styles.studentName}>{student.firstName} {student.lastName}</Text>
        <Text className="text-muted-foreground" style={styles.admission}>{student.admissionNumber}</Text>
      </View>
      <TouchableOpacity
        onPress={onCycle}
        style={[styles.statusToggle, { backgroundColor: cfg.bg }]}
        accessibilityLabel={`Toggle attendance, current ${status}`}
      >
        <Text style={[styles.statusToggleText, { color: cfg.color }]}>{cfg.shortCode}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function TeacherAttendance() {
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [showAllSections, setShowAllSections] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const c = useThemeColors();

  const [selectedBs, setSelectedBs] = useState<BsDate>(todayBs());
  const selectedDateAd = useMemo(() => adStringFromBs(selectedBs), [selectedBs]);
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>({});

  const { data: mySections, isLoading: sectionsLoading, refetch: refetchSections } = useMySections();
  const studentsResult = useSectionStudents(selectedSection);
  const existingResult = useSectionAttendance(selectedSection, selectedDateAd);
  const markMutation = useBulkMarkAttendance();

  useEffect(() => {
    if (!existingResult.data) return;
    const map: Record<string, AttendanceStatus> = {};
    existingResult.data.forEach((rec: SectionAttendanceRecord) => {
      const s = rec.status as AttendanceStatus;
      if (STATUS_OPTIONS.includes(s)) map[rec.studentId] = s;
    });
    setStatusMap(map);
  }, [existingResult.data]);

  useEffect(() => {
    if (!studentsResult.data) return;
    setStatusMap((prev) => {
      const next = { ...prev };
      studentsResult.data!.forEach((s) => { if (!next[s.id]) next[s.id] = 'PRESENT'; });
      return next;
    });
  }, [studentsResult.data]);

  const cycleStatus = useCallback((studentId: string) => {
    setStatusMap((prev) => {
      const curr = prev[studentId] ?? 'PRESENT';
      const idx = STATUS_OPTIONS.indexOf(curr);
      return { ...prev, [studentId]: STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length] };
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
    if (!academicYearId) { Alert.alert('Error', 'No active academic year found for this section.'); return; }
    const records = studentsResult.data.map((s) => ({ studentId: s.id, status: statusMap[s.id] ?? 'PRESENT' }));
    try {
      await markMutation.mutateAsync({ sectionId: selectedSection, academicYearId, date: selectedDateAd, records });
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
  const selectedSec = sections.find((s) => s.sectionId === selectedSection);
  const students = studentsResult.data ?? [];
  const presentCount = students.filter((s) => (statusMap[s.id] ?? 'PRESENT') === 'PRESENT').length;
  const absentCount = students.filter((s) => (statusMap[s.id] ?? 'PRESENT') === 'ABSENT').length;

  return (
    <ScrollView
      className="bg-background"
      style={styles.fill}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
    >
      <ScreenHeader
        variant="solid"
        title="Mark attendance"
        subtitle={`${selectedSec ? `${selectedSec.className} · ${selectedSec.sectionName} — ` : ''}${formatBs(selectedBs, 'en')}`}
      >
        {selectedSection && students.length > 0 && (
          <View style={styles.headerStats}>
            <View style={styles.headerStat}>
              <Text style={styles.headerStatNum}>{presentCount}</Text>
              <Text style={styles.headerStatLabel}>Present</Text>
            </View>
            <View style={styles.headerStat}>
              <Text style={styles.headerStatNum}>{absentCount}</Text>
              <Text style={styles.headerStatLabel}>Absent</Text>
            </View>
            <View style={styles.headerStat}>
              <Text style={styles.headerStatNum}>{students.length}</Text>
              <Text style={styles.headerStatLabel}>Total</Text>
            </View>
          </View>
        )}
      </ScreenHeader>

      <View style={styles.body}>
        {/* Section picker */}
        <Card padded>
          <CardLabel>{showAllSections ? 'All Sections' : 'My Sections'}</CardLabel>
          {sectionsLoading ? (
            <LoadingBlock />
          ) : sections.length === 0 && !showAllSections ? (
            <Text className="text-muted-foreground" style={styles.hint}>
              No sections assigned. Use "Mark a different section" below.
            </Text>
          ) : (
            <View style={styles.pickerList}>
              {sections.map((s) => (
                <SelectableRow
                  key={s.sectionId}
                  title={`${s.className} · ${s.sectionName}`}
                  selected={selectedSection === s.sectionId}
                  onPress={() => { setSelectedSection(s.sectionId); setStatusMap({}); setSubmitted(false); }}
                />
              ))}
            </View>
          )}
          <TouchableOpacity onPress={() => setShowAllSections(!showAllSections)} style={styles.toggleRow} activeOpacity={0.7}>
            <Ionicons name={showAllSections ? 'chevron-up' : 'swap-horizontal-outline'} size={14} color={c.mutedForeground} />
            <Text className="text-muted-foreground" style={styles.toggleText}>
              {showAllSections ? 'Show my sections only' : 'Mark a different section'}
            </Text>
          </TouchableOpacity>
        </Card>

        {/* Date picker */}
        <Card padded>
          <CardLabel>Date (BS)</CardLabel>
          <DateSelector selectedBs={selectedBs} onSelect={(bs) => { setSelectedBs(bs); setStatusMap({}); setSubmitted(false); }} />
          <Text className="text-muted-foreground" style={styles.adLine}>AD: {selectedDateAd}</Text>
        </Card>

        {/* Student list */}
        {selectedSection && (
          <Card padded={false}>
            <View className="border-b border-border" style={styles.listHeader}>
              <CardLabel>Students</CardLabel>
              <TouchableOpacity onPress={markAllPresent} style={styles.allPresentBtn} accessibilityLabel="Mark all present">
                <Text style={styles.allPresentText}>All Present</Text>
              </TouchableOpacity>
            </View>

            {studentsResult.isLoading || existingResult.isLoading ? (
              <LoadingBlock label="Loading students…" />
            ) : students.length === 0 ? (
              <EmptyState compact icon="people-outline" title="No students found in this section." />
            ) : (
              students.map((student) => (
                <StudentRow
                  key={student.id}
                  student={student}
                  status={statusMap[student.id] ?? 'PRESENT'}
                  onCycle={() => cycleStatus(student.id)}
                />
              ))
            )}

            {students.length > 0 && (
              <View className="border-t border-border" style={styles.legend}>
                {STATUS_OPTIONS.map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  return (
                    <View key={s} style={styles.legendItem}>
                      <View style={[styles.legendSwatch, { backgroundColor: cfg.bg }]}>
                        <Text style={[styles.legendCode, { color: cfg.color }]}>{cfg.shortCode}</Text>
                      </View>
                      <Text className="text-muted-foreground" style={styles.legendLabel}>{cfg.label}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </Card>
        )}

        {/* Submit */}
        {selectedSection && students.length > 0 && (
          submitted ? (
            <View style={styles.savedBanner}>
              <Ionicons name="checkmark-circle" size={22} color={STATUS_CONFIG.PRESENT.color} />
              <Text style={styles.savedText}>Attendance saved successfully</Text>
            </View>
          ) : (
            <PrimaryButton
              label={markMutation.isPending ? 'Saving…' : `Save Attendance (${students.length})`}
              icon="save-outline"
              loading={markMutation.isPending}
              onPress={handleSubmit}
            />
          )
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headerStats: { flexDirection: 'row', gap: 8, marginTop: 14 },
  headerStat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 11, paddingVertical: 8, alignItems: 'center' },
  headerStatNum: { color: '#fff', fontFamily: FONT.extrabold, fontSize: 16 },
  headerStatLabel: { color: 'rgba(255,255,255,0.85)', fontFamily: FONT.bold, fontSize: 9, textTransform: 'uppercase', marginTop: 1 },
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, gap: 12 },
  hint: { fontSize: 13 },
  pickerList: { gap: 8 },
  toggleRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 24 },
  toggleText: { fontSize: 12, fontFamily: FONT.semibold },
  // date
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  monthLabel: { fontSize: 15, fontFamily: FONT.bold },
  dayStrip: { gap: 6 },
  dayBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dayBtnText: { fontSize: 14, fontFamily: FONT.bold },
  adLine: { fontSize: 11, marginTop: 8 },
  // student list
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 12 },
  allPresentBtn: { backgroundColor: STATUS_CONFIG.PRESENT.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 12 },
  allPresentText: { fontSize: 11, color: STATUS_CONFIG.PRESENT.color, fontFamily: FONT.bold },
  studentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  roll: { fontSize: 12, width: 28, fontFamily: FONT.semibold },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 14, fontFamily: FONT.semibold },
  admission: { fontSize: 11 },
  statusToggle: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statusToggleText: { fontSize: 15, fontFamily: FONT.extrabold },
  legend: { flexDirection: 'row', gap: 12, padding: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch: { width: 16, height: 16, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  legendCode: { fontSize: 9, fontFamily: FONT.extrabold },
  legendLabel: { fontSize: 11 },
  savedBanner: {
    backgroundColor: STATUS_CONFIG.PRESENT.bg, borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  savedText: { color: STATUS_CONFIG.PRESENT.color, fontSize: 15, fontFamily: FONT.bold },
});
