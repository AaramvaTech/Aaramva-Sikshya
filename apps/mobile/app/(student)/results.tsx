import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, StatusBar, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { router } from 'expo-router';

import { useMyResults } from '../../hooks/useStudentMe';
import NpText from '../../components/NpText';
import Skeleton from '../../components/Skeleton';
import { Card, EmptyState, ErrorState, ScreenHeader } from '../../components/ui';
import { useReportCardDownload } from '../../hooks/useReportCardDownload';
import { useThemeColors, headerGradient } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import { gradeColors } from '../../lib/gradeColors';
import type { ExamTermResult, ResultSubject } from '../../types';

// Deduped "Grade N · Section X" — the API class label may arrive as "Grade 9",
// "Class 9" or bare "9"; normalise to a single "Grade …" so we never render the
// old "Class Grade 9" defect.
function gradeSectionLine(grade: string, section: string): string {
  const g = grade.trim();
  const normalized = /^(grade|class)\b/i.test(g) ? g.replace(/^class\b/i, 'Grade') : `Grade ${g}`;
  return `${normalized} · Section ${section}`;
}

// Subject row — matches comp sResults rows (subject name, "Full marks X", obtained, grade chip).
function SubjectRow({ subject, isLast }: { subject: ResultSubject; isLast: boolean }) {
  const c = useThemeColors();
  const gc = gradeColors(subject.grade);
  const fullMarks = subject.fullMarks;

  return (
    <View style={[styles.subjectRow, !isLast && { borderBottomWidth: 1, borderBottomColor: c.border }]}>
      <View style={styles.subjectInfo}>
        <NpText style={[styles.subjectName, { color: c.foreground }]}>{subject.name}</NpText>
        <Text style={[styles.subjectFullMarks, { color: c.mutedForeground }]}>
          Full marks {fullMarks > 0 ? fullMarks : '—'}
        </Text>
      </View>
      <Text style={[styles.totalValue, { color: c.foreground }]}>{subject.total}</Text>
      <View style={[styles.gradeChip, { backgroundColor: gc.bg }]}>
        <Text style={[styles.gradeChipText, { color: gc.fg }]}>{subject.grade}</Text>
      </View>
    </View>
  );
}

// GPA gradient card — brand-primary gradient (NOT a literal maroon).
// Layout mirrors comp sResults: GPA on the left, Grade · Rank on the right.
function SummaryCard({ term }: { term: ExamTermResult }) {
  const c = useThemeColors();
  const ramp = headerGradient(c.primary);
  return (
    <LinearGradient
      colors={[ramp[0], ramp[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.summaryCard, { shadowColor: c.primary }]}
    >
      <View style={styles.summaryLeft}>
        <Text style={styles.summaryLabel}>GPA</Text>
        <Text style={styles.summaryGpaValue}>{term.gpa.toFixed(2)}</Text>
      </View>
      <View style={styles.summaryRight}>
        <Text style={styles.summaryLabel}>Grade · Rank</Text>
        <Text style={styles.summaryGradeRank}>{term.grade} · #{term.rank}</Text>
      </View>
    </LinearGradient>
  );
}

export default function StudentResults() {
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const c = useThemeColors();

  const { data, isLoading, isError, refetch } = useMyResults();
  const { download, downloading } = useReportCardDownload();

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Simple white header — comp sResults style (back button + title block).
  const Header = ({ examName }: { examName?: string }) => (
    <ScreenHeader
      variant="bar"
      onBack={() => router.back()}
      title="Exam results"
      subtitle={examName}
      padBottom={16}
    />
  );

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <StatusBar barStyle="dark-content" />
        <Header />
        <View style={styles.body}>
          <Skeleton style={{ height: 36, marginBottom: 16 }} className="rounded-full" />
          <Skeleton style={{ height: 110, marginBottom: 14 }} className="rounded-3xl" />
          <Skeleton style={{ height: 260 }} className="rounded-2xl" />
        </View>
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <StatusBar barStyle="dark-content" />
        <Header />
        <View style={[styles.body, { paddingTop: 24 }]}>
          <ErrorState title="Couldn't load your results" onRetry={() => void refetch()} />
        </View>
      </View>
    );
  }

  const { student, examResults, annualResult } = data;
  const studentLine = `${student.name} · ${gradeSectionLine(student.grade, student.section)}`;

  // Default to the most recent term; clamp if the selection falls out of range.
  const activeIndex =
    selectedIndex !== null && selectedIndex < examResults.length
      ? selectedIndex
      : examResults.length - 1;
  const activeTerm = examResults[activeIndex];

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        <Header examName={activeTerm?.examName} />

        <View style={styles.body}>
          {examResults.length === 0 ? (
            <Card elevated padded style={{ paddingVertical: 36, marginTop: 8 }}>
              <EmptyState
                chip
                icon="ribbon-outline"
                title="No results published yet"
                subtitle="Your report card will appear here once the school publishes exam results."
              />
            </Card>
          ) : (
            <>
              {/* Term selector — only when more than one term exists */}
              {examResults.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.termRow}
                >
                  {examResults.map((term, idx) => {
                    const active = idx === activeIndex;
                    return (
                      <TouchableOpacity
                        key={term.examName}
                        onPress={() => setSelectedIndex(idx)}
                        activeOpacity={0.85}
                        style={[
                          styles.termPill,
                          { backgroundColor: active ? c.primary : c.surface, borderColor: active ? c.primary : c.border },
                        ]}
                      >
                        <Text
                          style={[styles.termPillText, { color: active ? c.primaryForeground : c.mutedForeground }]}
                        >
                          {term.examName}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* Headline summary for the selected term */}
              <SummaryCard term={activeTerm} />

              {/* Per-subject marks */}
              <View style={[styles.subjectCard, { backgroundColor: c.surface }]}>
                {activeTerm.subjects.map((subject, idx) => (
                  <SubjectRow
                    key={subject.name}
                    subject={subject}
                    isLast={idx === activeTerm.subjects.length - 1}
                  />
                ))}
              </View>

              {/* Annual aggregate — comp sReport style; only once the year is closed */}
              {annualResult && (
                <View style={[styles.annualCard, { backgroundColor: c.surface }]}>
                  <Text style={[styles.annualEyebrow, { color: c.mutedForeground }]}>Annual result</Text>
                  <View style={styles.annualStats}>
                    <View style={styles.annualStat}>
                      <Text style={[styles.annualStatValue, { color: c.primary }]}>
                        {annualResult.gpa.toFixed(2)}
                      </Text>
                      <Text style={[styles.annualStatLabel, { color: c.mutedForeground }]}>GPA</Text>
                    </View>
                    <View style={[styles.annualDivider, { backgroundColor: c.border }]} />
                    <View style={styles.annualStat}>
                      <Text style={[styles.annualStatValue, { color: c.primary }]}>
                        {annualResult.grade}
                      </Text>
                      <Text style={[styles.annualStatLabel, { color: c.mutedForeground }]}>Grade</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Download report card PDF — below annual block (comp sReport line 500) */}
              <TouchableOpacity
                onPress={download}
                disabled={downloading}
                activeOpacity={0.85}
                style={[styles.downloadBtn, { backgroundColor: c.brandSurface, borderColor: c.brandBorder }]}
              >
                <Ionicons name="download-outline" size={19} color={c.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.downloadBtnText, { color: c.primary }]}>
                  {downloading ? 'Downloading…' : 'Download report card PDF'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Body
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 36 },

  // Term selector
  termRow: { gap: 8, paddingVertical: 2, paddingRight: 4, marginBottom: 14 },
  termPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  termPillText: { fontFamily: FONT.bold, fontSize: 12 },

  // Summary card — brand gradient, horizontal GPA | Grade·Rank layout (comp lines 438-443)
  summaryCard: {
    borderRadius: 18, padding: 18, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14,
    shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 5,
  },
  summaryLeft: {},
  summaryRight: { alignItems: 'flex-end' },
  summaryLabel: {
    fontFamily: FONT.bold, fontSize: 11, color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  summaryGpaValue: { fontFamily: FONT.extrabold, fontSize: 32, color: '#FFFFFF', marginTop: 2, lineHeight: 36 },
  summaryGradeRank: { fontFamily: FONT.extrabold, fontSize: 24, color: '#FFFFFF', marginTop: 2 },

  // Subject rows — comp sResults style (name + full marks, obtained, grade chip)
  subjectCard: {
    borderRadius: 16, paddingHorizontal: 14, marginBottom: 14,
    shadowColor: '#10231A', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07, shadowRadius: 13, elevation: 2,
  },
  subjectRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  subjectInfo: { flex: 1, minWidth: 0 },
  subjectName: { fontFamily: FONT.bold, fontSize: 13 },
  subjectFullMarks: { fontFamily: FONT.regular, fontSize: 10.5, marginTop: 1 },
  totalValue: { fontFamily: FONT.extrabold, fontSize: 13.5 },
  gradeChip: { width: 38, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  gradeChipText: { fontFamily: FONT.extrabold, fontSize: 11 },

  // Annual result — comp sReport stat panel (lines 481-489)
  annualCard: {
    borderRadius: 18, padding: 18, marginBottom: 14, alignItems: 'center',
    shadowColor: '#10231A', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.09, shadowRadius: 18, elevation: 2,
  },
  annualEyebrow: {
    fontFamily: FONT.bold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12,
  },
  annualStats: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  annualStat: { alignItems: 'center' },
  annualStatValue: { fontFamily: FONT.extrabold, fontSize: 28, lineHeight: 32 },
  annualStatLabel: { fontFamily: FONT.bold, fontSize: 10, textTransform: 'uppercase', marginTop: 2 },
  annualDivider: { width: 1, height: 34 },

  // Download PDF button — comp sReport line 500 style (tinted, branded)
  downloadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 48, borderRadius: 14, borderWidth: 1.5,
  },
  downloadBtnText: { fontFamily: FONT.bold, fontSize: 14 },
});
