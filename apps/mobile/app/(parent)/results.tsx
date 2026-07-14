import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';

import { useMyChildren, useChildResults } from '../../hooks/useParentChild';
import { useReportCardDownload } from '../../hooks/useReportCardDownload';
import { useLocale } from '../../hooks/useLocale';
import NpText from '../../components/NpText';
import { useAuthStore } from '../../store/auth';
import { useThemeColors } from '../../lib/theme/colors';
import {
  EmptyState, ErrorState, ScreenHeader, Icon,
  ResultHero, GpaTrendBars, InsightCard, SubjectRow,
} from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';
import Skeleton from '../../components/Skeleton';
import { FONT } from '../../lib/theme/fonts';
import { gpaTrend, subjectInsights } from '../../lib/results';
import type { ExamResult } from '../../types';

// Per-exam-type block — GPA/grade/rank hero + top-subject/needs-focus insight
// tiles + subject rows, all shared with the student results screen (DRY). The
// parent screen has no single "active term" (every published exam is shown at
// once), so unlike the student screen this omits the gpaChange/rankChange
// strip on ResultHero — useChildResults doesn't sort `results` by
// examType.orderIndex the way the student hook defensively does, so a
// delta-vs-previous-block would silently assume an ordering the API doesn't
// guarantee. The GPA trend chart (self-labeled per point, order-agnostic) is
// rendered once for the whole history instead — see ParentResults below.
function ResultBlock({ result }: { result: ExamResult }) {
  const c = useThemeColors();
  const { t } = useLocale('parent');
  const rows = result.results ?? [];
  const pct = result.percentage != null ? Math.round(result.percentage) : 0;
  const insights = subjectInsights(
    rows.map((r) => ({
      subjectName: r.subjectName,
      percentage: r.marksObtained != null && r.fullMark > 0 ? (r.marksObtained / r.fullMark) * 100 : null,
      marksObtained: r.marksObtained,
      fullMarks: r.fullMark,
      grade: r.grade,
    })),
  );

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[styles.examName, { color: c.foreground }]}>{result.examTypeName}</Text>

      {/* GPA/grade/rank hero (shared with the student results screen) */}
      <View style={{ marginBottom: 14 }}>
        <ResultHero
          gpa={result.gpa ?? 0}
          pct={pct}
          grade={result.overallGrade}
          rank={result.rank}
        />
      </View>

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

      {/* Subject rows */}
      <View style={[styles.rowsCard, CARD_SHADOW, { backgroundColor: c.surface }]}>
        {rows.map((r, idx) => {
          const last = idx === rows.length - 1;
          return (
            <View key={r.subjectId} style={!last ? { borderBottomWidth: 1, borderBottomColor: c.border } : undefined}>
              <SubjectRow name={r.subjectName} obtained={r.marksObtained} fullMarks={r.fullMark} grade={r.grade} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function ParentResults() {
  const { t } = useLocale('parent');
  const [refreshing, setRefreshing] = useState(false);
  const c = useThemeColors();

  const selectedChildId = useAuthStore((s) => s.selectedChildId);
  const setSelectedChildId = useAuthStore((s) => s.setSelectedChildId);
  const childrenQuery = useMyChildren();
  const children = childrenQuery.data ?? [];
  const effectiveChildId: string | null = selectedChildId ?? (children[0]?.id ?? null);
  useEffect(() => {
    if (!selectedChildId && effectiveChildId) setSelectedChildId(effectiveChildId);
  }, [selectedChildId, effectiveChildId, setSelectedChildId]);
  const selectedChild = children.find((ch) => ch.id === effectiveChildId) ?? null;

  const resultsQuery = useChildResults(effectiveChildId ?? '');
  const results = resultsQuery.data ?? [];

  // POL-2 T4: own-child report-card PDF. Passing the childId routes the shared
  // download hook to the parent-scoped endpoint (/exams/results/report-card/:id/pdf),
  // which enforces the guardian hard-scope + publish gate (403 / 409 handled inside).
  const { download, downloading } = useReportCardDownload(effectiveChildId ?? undefined);

  const onRefresh = async () => {
    setRefreshing(true);
    await resultsQuery.refetch();
    setRefreshing(false);
  };

  const childName = selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : '';
  // Trend across every published exam for this child — order-agnostic (each
  // bar is self-labeled by exam name), so it's safe even though the API order
  // isn't guaranteed chronological. GpaTrendBars itself hides below 2 points.
  const trendData = gpaTrend(results.map((r) => ({ name: r.examTypeName, gpa: r.gpa })));

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        <ScreenHeader
          variant="plain"
          compact
          padTop={12}
          padBottom={16}
          title={t('results.title')}
          subtitle={childName || undefined}
          npSubtitle
        />

        <View style={styles.body}>
          {resultsQuery.isLoading ? (
            <View style={{ gap: 14 }}>
              <Skeleton style={{ height: 92 }} className="rounded-2xl" />
              <Skeleton style={{ height: 160 }} className="rounded-2xl" />
            </View>
          ) : resultsQuery.isError ? (
            <View style={{ paddingTop: 24 }}>
              <ErrorState title={t('results.errorTitle')} onRetry={() => void resultsQuery.refetch()} />
            </View>
          ) : results.length === 0 ? (
            <View style={{ paddingTop: 24 }}>
              <EmptyState icon="ribbon-outline" title={t('results.emptyTitle')} subtitle={t('results.emptySubtitle')} />
            </View>
          ) : (
            <>
              {trendData.length >= 2 && (
                <View style={{ marginBottom: 16 }}>
                  <GpaTrendBars data={trendData} />
                </View>
              )}

              {results.map((r) => <ResultBlock key={`${r.examTypeId}-${r.studentId}`} result={r} />)}

              {/* Download report card PDF — mirrors the student results screen */}
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

  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  examName: { fontFamily: FONT.extrabold, fontSize: 13, marginBottom: 10, marginLeft: 2 },

  // Insight tiles row — top subject / needs focus (shared InsightCard)
  insightRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },

  // Subject rows — shared SubjectRow, wrapped in a bordered card
  rowsCard: { borderRadius: 16, paddingHorizontal: 14 },

  // Download PDF button — same treatment as the student results screen
  downloadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 48, borderRadius: 14, borderWidth: 1.5, marginTop: 4,
  },
  downloadBtnText: { fontFamily: FONT.bold, fontSize: 14 },
});
