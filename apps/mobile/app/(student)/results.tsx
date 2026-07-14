import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, StatusBar, StyleSheet,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';

import { useMyResults } from '../../hooks/useStudentMe';
import NpText from '../../components/NpText';
import Skeleton from '../../components/Skeleton';
import {
  Card, EmptyState, ErrorState, ScreenHeader,
  ResultHero, GpaTrendBars, InsightCard, SubjectRow, Icon,
} from '../../components/ui';
import { useReportCardDownload } from '../../hooks/useReportCardDownload';
import { useThemeColors } from '../../lib/theme/colors';
import { useLocale } from '../../hooks/useLocale';
import { FONT } from '../../lib/theme/fonts';
import { gpaTrend, gpaChange as computeGpaChange, rankChange as computeRankChange, subjectInsights } from '../../lib/results';

// Deduped "Grade N · Section X" — the API class label may arrive as "Grade 9",
// "Class 9" or bare "9"; normalise to a single "Grade …" so we never render the
// old "Class Grade 9" defect.
function gradeSectionLine(grade: string, section: string): string {
  const g = grade.trim();
  const normalized = /^(grade|class)\b/i.test(g) ? g.replace(/^class\b/i, 'Grade') : `Grade ${g}`;
  return `${normalized} · Section ${section}`;
}

export default function StudentResults() {
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const c = useThemeColors();

  const { t } = useLocale('student');
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
      title={t('results.title')}
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
          <ErrorState title={t('results.errorTitle')} onRetry={() => void refetch()} />
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

  // Aggregate percentage across the active term's subjects (no percentage field on the API).
  const fmSum = activeTerm ? activeTerm.subjects.reduce((sum, s) => sum + s.fullMarks, 0) : 0;
  const totalSum = activeTerm ? activeTerm.subjects.reduce((sum, s) => sum + s.total, 0) : 0;
  const pct = fmSum > 0 ? Math.round((totalSum / fmSum) * 100) : 0;

  const gpaChangeVal = computeGpaChange(examResults.map((t) => ({ gpa: t.gpa })), activeIndex);
  const rankChangeVal = computeRankChange(examResults.map((t) => ({ rankInClass: t.rank })), activeIndex);
  const trendData = gpaTrend(examResults.map((t) => ({ name: t.examName, gpa: t.gpa })));
  const insights = activeTerm
    ? subjectInsights(
        activeTerm.subjects.map((s) => ({
          subjectName: s.name,
          percentage: s.fullMarks > 0 ? (s.total / s.fullMarks) * 100 : null,
          marksObtained: s.total,
          fullMarks: s.fullMarks,
          grade: s.grade,
        })),
      )
    : { top: null, focus: null };

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
                title={t('results.emptyTitle')}
                subtitle={t('results.emptySubtitle')}
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
              <View style={{ marginBottom: 14 }}>
                <ResultHero
                  gpa={activeTerm.gpa}
                  pct={pct}
                  grade={activeTerm.grade}
                  rank={activeTerm.rank}
                  gpaChange={gpaChangeVal}
                  rankChange={rankChangeVal}
                />
              </View>

              {/* GPA trend across published terms — hidden below 2 data points */}
              {trendData.length >= 2 && (
                <View style={{ marginBottom: 14 }}>
                  <GpaTrendBars data={trendData} />
                </View>
              )}

              {/* Top-subject / needs-focus insight tiles — hidden when nothing is graded */}
              {(insights.top || insights.focus) && (
                <View style={styles.insightRow}>
                  {insights.top && (
                    <InsightCard
                      tone="success"
                      icon="trending_up"
                      label={t('results.topSubject')}
                      subject={insights.top.subjectName}
                      detail={`${insights.top.marksObtained}/${insights.top.fullMarks} · ${insights.top.grade}`}
                    />
                  )}
                  {insights.focus && (
                    <InsightCard
                      tone="warning"
                      icon="flag"
                      label={t('results.needsFocus')}
                      subject={insights.focus.subjectName}
                      detail={`${insights.focus.marksObtained}/${insights.focus.fullMarks} · ${insights.focus.grade}`}
                    />
                  )}
                </View>
              )}

              {/* Per-subject marks */}
              <View style={[styles.subjectCard, { backgroundColor: c.surface }]}>
                {activeTerm.subjects.map((subject, idx) => (
                  <View
                    key={subject.name}
                    style={idx !== activeTerm.subjects.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }}
                  >
                    <SubjectRow
                      name={subject.name}
                      obtained={subject.total}
                      fullMarks={subject.fullMarks}
                      grade={subject.grade}
                    />
                  </View>
                ))}
              </View>

              {/* Annual aggregate — comp sReport style; only once the year is closed */}
              {annualResult && (
                <View style={[styles.annualCard, { backgroundColor: c.surface }]}>
                  <NpText style={[styles.annualEyebrow, { color: c.mutedForeground }]}>{t('results.annualResult')}</NpText>
                  <View style={styles.annualStats}>
                    <View style={styles.annualStat}>
                      <Text style={[styles.annualStatValue, { color: c.primary }]}>
                        {annualResult.gpa.toFixed(2)}
                      </Text>
                      <NpText style={[styles.annualStatLabel, { color: c.mutedForeground }]}>{t('results.gpa')}</NpText>
                    </View>
                    <View style={[styles.annualDivider, { backgroundColor: c.border }]} />
                    <View style={styles.annualStat}>
                      <Text style={[styles.annualStatValue, { color: c.primary }]}>
                        {annualResult.grade}
                      </Text>
                      <NpText style={[styles.annualStatLabel, { color: c.mutedForeground }]}>{t('results.grade')}</NpText>
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
                <Icon name="download" size={19} color={c.primary} style={{ marginRight: 8 }} />
                <NpText style={[styles.downloadBtnText, { color: c.primary }]}>
                  {downloading ? t('results.downloading') : t('results.downloadPdf')}
                </NpText>
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

  // Insight tiles row — top subject / needs focus (shared InsightCard)
  insightRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },

  // Subject rows — shared SubjectRow, wrapped in a bordered card
  subjectCard: {
    borderRadius: 16, paddingHorizontal: 14, marginBottom: 14,
    shadowColor: '#10231A', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07, shadowRadius: 13, elevation: 2,
  },

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
