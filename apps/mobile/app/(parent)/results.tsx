import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StatusBar, StyleSheet, Share } from 'react-native';
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
import {
  gpaTrend, gpaChange as computeGpaChange, rankChange as computeRankChange, subjectInsights,
} from '../../lib/results';
import type { ExamResult } from '../../types';

// Per-exam-type block — GPA/grade/rank hero + top-subject/needs-focus insight
// tiles + subject rows, all shared with the student results screen (DRY). The
// parent screen has no single "active term" (every published exam is shown at
// once, oldest → newest), so each block gets its OWN term-over-term
// gpaChange/rankChange (vs the block before it) rather than a single active-term
// delta. The exams now carry `orderIndex` (backend examType.orderIndex) so the
// caller can sort chronologically before computing changes — see ParentResults.
function ResultBlock({
  result, gpaChange, rankChange,
}: { result: ExamResult; gpaChange?: number | null; rankChange?: number | null }) {
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
          gpa={result.gpa}
          pct={pct}
          grade={result.overallGrade}
          rank={result.rank}
          gpaChange={gpaChange}
          rankChange={rankChange}
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
  // Chronological order (oldest → newest) via the backend's examType.orderIndex —
  // required for the trend chart and term-over-term change strips to read correctly.
  const results = [...(resultsQuery.data ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);

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

  // GPA trend across all published terms — hidden below 2 data points (component self-guards too).
  const trendData = gpaTrend(results.map((r) => ({ name: r.examTypeName, gpa: r.gpa })));

  // Text-only share (no PDF) — summarises the most recent published term.
  const latestResult = results.length > 0 ? results[results.length - 1] : null;
  const handleShare = async () => {
    if (!latestResult) return;
    try {
      await Share.share({
        message: t('results.shareMessage', {
          name: childName || t('results.title'),
          term: latestResult.examTypeName,
          gpa: latestResult.gpa != null ? latestResult.gpa.toFixed(2) : '—',
          grade: latestResult.overallGrade ?? '—',
        }),
      });
    } catch {
      // Share sheet dismissed/failed — nothing to surface to the user.
    }
  };

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
              {/* GPA trend across published terms — hidden below 2 data points */}
              {trendData.length >= 2 && (
                <View style={{ marginBottom: 16 }}>
                  <GpaTrendBars data={trendData} />
                </View>
              )}

              {results.map((r, idx) => (
                <ResultBlock
                  key={`${r.examTypeId}-${r.studentId}`}
                  result={r}
                  gpaChange={computeGpaChange(results.map((t) => ({ gpa: t.gpa })), idx)}
                  rankChange={computeRankChange(results.map((t) => ({ rankInClass: t.rank })), idx)}
                />
              ))}

              {/* Download report card PDF + share summary — mirrors the student results screen */}
              <View style={styles.actionsRow}>
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
                <TouchableOpacity
                  onPress={handleShare}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t('results.share')}
                  style={[styles.shareBtn, { backgroundColor: c.brandSurface, borderColor: c.brandBorder }]}
                >
                  <Icon name="share" size={19} color={c.primary} />
                </TouchableOpacity>
              </View>
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

  // Download PDF + share row
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  downloadBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 48, borderRadius: 14, borderWidth: 1.5,
  },
  downloadBtnText: { fontFamily: FONT.bold, fontSize: 14 },
  // Share button — same tinted treatment as download, icon-only square
  shareBtn: {
    width: 48, height: 48, borderRadius: 14, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
});
