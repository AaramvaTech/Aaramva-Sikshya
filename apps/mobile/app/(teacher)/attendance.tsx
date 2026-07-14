import {
  View, Text, ScrollView, FlatList, TouchableOpacity, Alert, RefreshControl, TextInput, StyleSheet,
} from 'react-native';
import { useLocale, bsLang } from '../../hooks/useLocale';
import NpText from '../../components/NpText';
import { useState, useMemo, useCallback, useEffect, memo } from 'react';
import {
  useMySections, useSectionStudents, useSectionAttendance, useBulkMarkAttendance,
} from '../../hooks/useTeacher';
import { todayBs, bsToAd, formatBs, daysInBsMonth, BS_MONTH_NAMES_EN } from 'bs-calendar';
import type { BsDate } from 'bs-calendar';
import type { StudentProfile, SectionAttendanceRecord } from '../../types';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import { localDateKey } from '../../lib/time';
import { STATUS_CONFIG } from '../../lib/attendance';
import {
  ScreenHeader, Card, CardLabel, PrimaryButton, SelectableRow, EmptyState, LoadingBlock, ErrorState, Icon,
} from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE';
const STATUS_OPTIONS: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE'];

function adStringFromBs(bs: BsDate): string {
  // localDateKey reads local calendar components (TZ-safe); toISOString would
  // shift a Nepal (+05:45) local-midnight date back to the previous UTC day.
  return localDateKey(bsToAd(bs));
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
          <Icon name="chevron_left" size={20} color={c.primary} />
        </TouchableOpacity>
        <Text className="text-foreground" style={styles.monthLabel}>
          {BS_MONTH_NAMES_EN[viewMonth.month - 1]} {viewMonth.year}
        </Text>
        <TouchableOpacity onPress={() => setViewMonth(nextMonth(viewMonth))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Next month">
          <Icon name="chevron_right" size={20} color={c.primary} />
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

const StudentRow = memo(function StudentRow({ student, status, onCycle }: { student: StudentProfile; status: AttendanceStatus; onCycle: (studentId: string) => void }) {
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
        onPress={() => onCycle(student.id)}
        style={[styles.statusToggle, { backgroundColor: cfg.bg }]}
        accessibilityLabel={`Toggle attendance, current ${status}`}
      >
        <Text style={[styles.statusToggleText, { color: cfg.color }]}>{cfg.shortCode}</Text>
      </TouchableOpacity>
    </View>
  );
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function TeacherAttendance() {
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [showAllSections, setShowAllSections] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const c = useThemeColors();
  const { t, locale } = useLocale('teacher');

  const [selectedBs, setSelectedBs] = useState<BsDate>(todayBs());
  const selectedDateAd = useMemo(() => adStringFromBs(selectedBs), [selectedBs]);
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>({});

  const { data: mySections, isLoading: sectionsLoading, isError: sectionsError, refetch: refetchSections } = useMySections();
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
    if (!academicYearId) { Alert.alert(t('attendance.alertErrorTitle'), t('attendance.alertNoYear')); return; }
    const records = studentsResult.data.map((s) => ({ studentId: s.id, status: statusMap[s.id] ?? 'PRESENT' }));
    try {
      await markMutation.mutateAsync({ sectionId: selectedSection, academicYearId, date: selectedDateAd, records });
      setSubmitted(true);
    } catch {
      Alert.alert(t('attendance.alertFailedTitle'), t('attendance.alertSaveFailed'));
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

  // Display-only name filter — the underlying roster (`students`), `statusMap`,
  // and submission (`handleSubmit`, which maps over `studentsResult.data`) are
  // untouched; this only narrows what's rendered in the FlatList.
  const searchTerm = searchQuery.trim().toLowerCase();
  const filteredStudents = searchTerm
    ? students.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(searchTerm))
    : students;

  const rosterLoading = studentsResult.isLoading || existingResult.isLoading;
  const rosterError = studentsResult.isError || existingResult.isError;
  // Roster rows render as FlatList items (virtualized) — only when ready, loaded and non-empty.
  const showRows = !!selectedSection && !rosterLoading && !rosterError && filteredStudents.length > 0;

  return (
    <FlatList
      className="bg-background"
      style={styles.fill}
      data={showRows ? filteredStudents : []}
      keyExtractor={(item) => item.id}
      extraData={statusMap}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      renderItem={({ item }) => (
        <View style={[styles.rowWrap, { backgroundColor: c.surface }]}>
          <StudentRow
            student={item}
            status={statusMap[item.id] ?? 'PRESENT'}
            onCycle={cycleStatus}
          />
        </View>
      )}
      ListHeaderComponent={
        <>
          <ScreenHeader
            variant="solid"
            title={t('attendance.title')}
            subtitle={`${selectedSec ? `${selectedSec.className} · ${selectedSec.sectionName} — ` : ''}${formatBs(selectedBs, bsLang(locale))}`}
          >
            {selectedSection && students.length > 0 && (
              <View style={styles.headerStats}>
                <View style={styles.headerStat}>
                  <Text style={styles.headerStatNum}>{presentCount}</Text>
                  <NpText style={styles.headerStatLabel}>{t('attendance.present')}</NpText>
                </View>
                <View style={styles.headerStat}>
                  <Text style={styles.headerStatNum}>{absentCount}</Text>
                  <NpText style={styles.headerStatLabel}>{t('attendance.absent')}</NpText>
                </View>
                <View style={styles.headerStat}>
                  <Text style={styles.headerStatNum}>{students.length}</Text>
                  <NpText style={styles.headerStatLabel}>{t('attendance.total')}</NpText>
                </View>
              </View>
            )}
          </ScreenHeader>

          <View style={styles.headerArea}>
            {/* Section picker */}
            <Card padded>
              <CardLabel>{showAllSections ? 'All Sections' : 'My Sections'}</CardLabel>
              {sectionsLoading ? (
                <LoadingBlock />
              ) : sectionsError ? (
                <ErrorState compact title={t('attendance.errorSections')} onRetry={() => void refetchSections()} />
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
                <Icon name={showAllSections ? 'expand_less' : 'swap_horiz'} size={14} color={c.mutedForeground} />
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

            {/* Student list — card header + non-row states (rows render below as FlatList items) */}
            {selectedSection && (
              <View
                style={[
                  styles.rosterCardTop,
                  CARD_SHADOW,
                  { backgroundColor: c.surface },
                  !showRows && styles.rosterCardBottom,
                ]}
              >
                <View className="border-b border-border" style={styles.listHeader}>
                  <CardLabel>{t('attendance.students')}</CardLabel>
                  <TouchableOpacity onPress={markAllPresent} style={styles.allPresentBtn} accessibilityLabel="Mark all present">
                    <NpText style={styles.allPresentText}>{t('attendance.allPresent')}</NpText>
                  </TouchableOpacity>
                </View>
                {!rosterLoading && !rosterError && students.length > 0 && (
                  <View style={[styles.searchRow, { backgroundColor: c.surfaceMuted, borderColor: c.border }]}>
                    <Icon name="search" size={18} color={c.mutedForeground} />
                    <TextInput
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      placeholder={t('attendance.searchPlaceholder')}
                      placeholderTextColor={c.placeholderIcon}
                      style={[styles.searchInput, { color: c.foreground }]}
                      accessibilityLabel={t('attendance.searchPlaceholder')}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                )}
                {rosterLoading ? (
                  <LoadingBlock label={t('attendance.loadingStudents')} />
                ) : rosterError ? (
                  <ErrorState
                    compact
                    title={t('attendance.errorStudents')}
                    onRetry={() => { void studentsResult.refetch(); void existingResult.refetch(); }}
                  />
                ) : students.length === 0 ? (
                  <EmptyState compact icon="people-outline" title={t('attendance.noStudents')} />
                ) : filteredStudents.length === 0 ? (
                  <EmptyState compact icon="search-outline" title={t('attendance.noSearchResults')} />
                ) : null}
              </View>
            )}
          </View>
        </>
      }
      ListFooterComponent={
        <View style={styles.footerArea}>
          {showRows && (
            <View style={[styles.legendCard, CARD_SHADOW, { backgroundColor: c.surface }]}>
              <View className="border-t border-border" style={styles.legend}>
                {STATUS_OPTIONS.map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  return (
                    <View key={s} style={styles.legendItem}>
                      <View style={[styles.legendSwatch, { backgroundColor: cfg.bg }]}>
                        <Text style={[styles.legendCode, { color: cfg.color }]}>{cfg.shortCode}</Text>
                      </View>
                      <NpText className="text-muted-foreground" style={styles.legendLabel}>{t(cfg.labelKey)}</NpText>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {selectedSection && students.length > 0 && (
            <View style={styles.submitWrap}>
              {submitted ? (
                <View style={styles.savedBanner}>
                  <Icon name="check_circle" size={22} color={STATUS_CONFIG.PRESENT.color} />
                  <NpText style={styles.savedText}>{t('attendance.saved')}</NpText>
                </View>
              ) : (
                <PrimaryButton
                  label={markMutation.isPending ? t('attendance.saving') : t('attendance.saveWithCount', { count: students.length })}
                  icon="save"
                  loading={markMutation.isPending}
                  onPress={handleSubmit}
                />
              )}
            </View>
          )}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headerStats: { flexDirection: 'row', gap: 8, marginTop: 14 },
  headerStat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 11, paddingVertical: 8, alignItems: 'center' },
  headerStatNum: { color: '#fff', fontFamily: FONT.extrabold, fontSize: 16 },
  headerStatLabel: { color: 'rgba(255,255,255,0.85)', fontFamily: FONT.bold, fontSize: 9, textTransform: 'uppercase', marginTop: 1 },
  // FlatList header (header + pickers + roster card top) / footer (legend + submit).
  // Roster rows render as virtualized items between them; the roster card is split into
  // a rounded top (here) + surface rows + a rounded legend so it reads as one card.
  headerArea: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  footerArea: { paddingBottom: 40 },
  rosterCardTop: { borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
  rosterCardBottom: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden' },
  rowWrap: { marginHorizontal: 16 },
  legendCard: { marginHorizontal: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden' },
  submitWrap: { marginHorizontal: 16, marginTop: 12 },
  hint: { fontSize: 13 },
  pickerList: { gap: 8 },
  toggleRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 24 },
  toggleText: { fontSize: 12, fontFamily: FONT.semibold },
  // roster search (display-only filter — see filteredStudents)
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 12,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: FONT.medium, paddingVertical: 0 },
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
