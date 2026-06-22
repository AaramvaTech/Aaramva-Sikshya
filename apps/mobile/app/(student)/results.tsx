import {
  View, Text, Image, ScrollView, TouchableOpacity, RefreshControl, StatusBar, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMyResults } from '../../hooks/useStudentMe';
import NpText from '../../components/NpText';
import Skeleton from '../../components/Skeleton';
import { Card, CardLabel, EmptyState, ErrorState } from '../../components/ui';
import { useAuthStore } from '../../store/auth';
import { useBranding } from '../../lib/theme/provider';
import { useThemeColors, headerGradient } from '../../lib/theme/colors';
import { subjectColor } from '../../lib/subjects';
import { FONT } from '../../lib/theme/fonts';
import type { ExamTermResult, ResultSubject } from '../../types';

// Deduped "Grade N · Section X" — the API class label may arrive as "Grade 9",
// "Class 9" or bare "9"; normalise to a single "Grade …" so we never render the
// old "Class Grade 9" defect.
function gradeSectionLine(grade: string, section: string): string {
  const g = grade.trim();
  const normalized = /^(grade|class)\b/i.test(g) ? g.replace(/^class\b/i, 'Grade') : `Grade ${g}`;
  return `${normalized} · Section ${section}`;
}

// "Gyan Jyoti Secondary School" -> { head, tail } (mirrors the Home hero band).
function splitName(name: string): { head: string; tail: string } {
  const words = name.trim().split(/\s+/);
  if (words.length <= 2) return { head: name, tail: 'Student portal' };
  return { head: words.slice(0, 2).join(' '), tail: words.slice(2).join(' ') };
}

// Semantic grade palette — legible dark ink on a soft tint (NOT brand-coupled, a
// documented exception on par with the attendance STATUS_CONFIG / subject hues).
function gradeColors(grade: string): { bg: string; fg: string } {
  const g = grade.trim().toUpperCase();
  if (g.startsWith('A')) return { bg: '#d1fae5', fg: '#065f46' };
  if (g.startsWith('B')) return { bg: '#dbeafe', fg: '#1e40af' };
  if (g.startsWith('C')) return { bg: '#fef3c7', fg: '#92400e' };
  if (g.startsWith('D') || g.startsWith('E') || g.startsWith('F')) return { bg: '#fee2e2', fg: '#991b1b' };
  return { bg: '#eef2f6', fg: '#475569' };
}

function SubjectRow({ subject, index, isLast }: { subject: ResultSubject; index: number; isLast: boolean }) {
  const c = useThemeColors();
  const hue = subjectColor(index);
  const gc = gradeColors(subject.grade);
  const hasPractical = subject.practical !== null;

  return (
    <View style={[styles.subjectRow, !isLast && { borderBottomWidth: 1, borderBottomColor: c.border }]}>
      <View style={[styles.subjectDot, { backgroundColor: hue.bar }]} />
      <View style={styles.subjectInfo}>
        <NpText style={[styles.subjectName, { color: c.foreground }]}>{subject.name}</NpText>
        {hasPractical ? (
          <Text style={[styles.subjectBreakdown, { color: c.mutedForeground }]}>
            Theory {subject.theory ?? '—'} · Practical {subject.practical}
          </Text>
        ) : (
          <Text style={[styles.subjectBreakdown, { color: c.mutedForeground }]}>Theory only</Text>
        )}
      </View>
      <View style={styles.subjectMarks}>
        <Text style={[styles.totalValue, { color: c.foreground }]}>{subject.total}</Text>
        <Text style={[styles.totalLabel, { color: c.mutedForeground }]}>Total</Text>
      </View>
      <View style={[styles.gradeChip, { backgroundColor: gc.bg }]}>
        <Text style={[styles.gradeChipText, { color: gc.fg }]}>{subject.grade}</Text>
      </View>
    </View>
  );
}

function SummaryCard({ term }: { term: ExamTermResult }) {
  const c = useThemeColors();
  const ramp = headerGradient(c.primary);
  return (
    <LinearGradient
      colors={[ramp[1], ramp[2]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.summaryCard, { shadowColor: c.primary }]}
    >
      <View style={styles.summaryGpa}>
        <Text style={styles.summaryGpaLabel}>GPA</Text>
        <Text style={styles.summaryGpaValue}>{term.gpa.toFixed(2)}</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryMeta}>
        <View style={styles.summaryMetaItem}>
          <Text style={styles.summaryMetaLabel}>Grade</Text>
          <Text style={styles.summaryMetaValue}>{term.grade}</Text>
        </View>
        <View style={styles.summaryMetaItem}>
          <Text style={styles.summaryMetaLabel}>Rank</Text>
          <Text style={styles.summaryMetaValue}>#{term.rank}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

export default function StudentResults() {
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const tenant = useAuthStore((s) => s.tenant);
  const { branding } = useBranding();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();

  const { data, isLoading, isError, refetch } = useMyResults();

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const schoolName = branding?.name ?? tenant?.name ?? 'Aaramva Shikshya';
  const { head } = splitName(schoolName);
  const initials = head.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

  // Shared branded header — present in every state so the screen never flashes blank.
  const Header = ({ subtitle }: { subtitle?: string }) => (
    <View
      style={[
        styles.band,
        { paddingTop: insets.top + 12, backgroundColor: c.brandSurface, borderBottomColor: c.brandBorder },
      ]}
    >
      <View style={styles.bandTop}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={10}
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={20} color={c.primary} />
        </TouchableOpacity>
        {branding?.logoUrl ? (
          <View style={[styles.logoChip, { backgroundColor: c.surface }]}>
            <Image source={{ uri: branding.logoUrl }} style={{ width: 24, height: 24 }} resizeMode="contain" />
          </View>
        ) : (
          <View style={[styles.logoChip, { backgroundColor: c.primary }]}>
            <Text style={[styles.logoChipText, { color: c.primaryForeground }]}>{initials}</Text>
          </View>
        )}
      </View>

      <Text style={[styles.title, { color: c.foreground }]}>Results</Text>
      {subtitle ? <NpText style={[styles.subtitle, { color: c.brandMuted }]}>{subtitle}</NpText> : null}
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <StatusBar barStyle="dark-content" />
        <Header subtitle="Loading report card…" />
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
  const subtitle = `${student.name} · ${gradeSectionLine(student.grade, student.section)}`;

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
        <Header subtitle={subtitle} />

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
              <Text style={[styles.examHeading, { color: c.foreground }]}>{activeTerm.examName}</Text>
              <SummaryCard term={activeTerm} />

              {/* Per-subject marks */}
              <Card padded style={{ marginTop: 14 }}>
                <CardLabel>Subjects</CardLabel>
                <View>
                  {activeTerm.subjects.map((subject, idx) => (
                    <SubjectRow
                      key={subject.name}
                      subject={subject}
                      index={idx}
                      isLast={idx === activeTerm.subjects.length - 1}
                    />
                  ))}
                </View>
              </Card>

              {/* Annual aggregate — only once the year is closed */}
              {annualResult && (
                <Card padded style={[styles.annualCard, { borderColor: c.brandBorder }]}>
                  <CardLabel>Annual Result</CardLabel>
                  <View style={styles.annualRow}>
                    <View style={styles.annualItem}>
                      <Text style={[styles.annualValue, { color: c.primary }]}>{annualResult.gpa.toFixed(2)}</Text>
                      <Text style={[styles.annualLabel, { color: c.mutedForeground }]}>Annual GPA</Text>
                    </View>
                    <View style={[styles.annualItem, { borderLeftWidth: 1, borderLeftColor: c.border }]}>
                      <Text style={[styles.annualValue, { color: c.primary }]}>{annualResult.grade}</Text>
                      <Text style={[styles.annualLabel, { color: c.mutedForeground }]}>Overall Grade</Text>
                    </View>
                  </View>
                </Card>
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

  // Hero band
  band: { paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1 },
  bandTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: {
    width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#10231A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
  },
  logoChip: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  logoChipText: { fontFamily: FONT.extrabold, fontSize: 12.5, letterSpacing: 0.5 },
  title: { fontFamily: FONT.extrabold, fontSize: 25, marginTop: 16, letterSpacing: -0.4 },
  subtitle: { fontFamily: FONT.medium, fontSize: 12.5, marginTop: 3 },

  // Body
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 36 },

  // Term selector
  termRow: { gap: 8, paddingVertical: 2, paddingRight: 4 },
  termPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  termPillText: { fontFamily: FONT.bold, fontSize: 12 },

  examHeading: { fontFamily: FONT.extrabold, fontSize: 14, marginTop: 18, marginBottom: 10, marginLeft: 2 },

  // Summary card
  summaryCard: {
    borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center',
    shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.28, shadowRadius: 20, elevation: 5,
  },
  summaryGpa: { flex: 1 },
  summaryGpaLabel: { fontFamily: FONT.bold, fontSize: 11, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 0.8 },
  summaryGpaValue: { fontFamily: FONT.extrabold, fontSize: 40, color: '#FFFFFF', marginTop: 2, letterSpacing: -1 },
  summaryDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 18 },
  summaryMeta: { gap: 14 },
  summaryMetaItem: { alignItems: 'flex-end' },
  summaryMetaLabel: { fontFamily: FONT.bold, fontSize: 10.5, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 0.6 },
  summaryMetaValue: { fontFamily: FONT.extrabold, fontSize: 22, color: '#FFFFFF', marginTop: 1 },

  // Subject rows
  subjectRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  subjectDot: { width: 9, height: 9, borderRadius: 5 },
  subjectInfo: { flex: 1, minWidth: 0 },
  subjectName: { fontFamily: FONT.bold, fontSize: 14 },
  subjectBreakdown: { fontFamily: FONT.regular, fontSize: 11, marginTop: 2 },
  subjectMarks: { alignItems: 'center', minWidth: 44 },
  totalValue: { fontFamily: FONT.extrabold, fontSize: 16 },
  totalLabel: { fontFamily: FONT.medium, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 1 },
  gradeChip: { minWidth: 40, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  gradeChipText: { fontFamily: FONT.extrabold, fontSize: 12 },

  // Annual
  annualCard: { marginTop: 14, borderWidth: 1 },
  annualRow: { flexDirection: 'row' },
  annualItem: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  annualValue: { fontFamily: FONT.extrabold, fontSize: 26 },
  annualLabel: { fontFamily: FONT.medium, fontSize: 11, marginTop: 2 },
});
