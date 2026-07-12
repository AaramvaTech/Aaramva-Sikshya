import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';

import { useMyChildren, useChildResults } from '../../hooks/useParentChild';
import { useReportCardDownload } from '../../hooks/useReportCardDownload';
import { useLocale } from '../../hooks/useLocale';
import NpText from '../../components/NpText';
import { useAuthStore } from '../../store/auth';
import { useThemeColors, headerGradient } from '../../lib/theme/colors';
import { EmptyState, ErrorState, ScreenHeader } from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';
import Skeleton from '../../components/Skeleton';
import { FONT } from '../../lib/theme/fonts';
import { gradeColors } from '../../lib/gradeColors';
import type { ExamResult } from '../../types';

function ResultBlock({ result }: { result: ExamResult }) {
  const c = useThemeColors();
  const { t } = useLocale('parent');
  const ramp = headerGradient(c.primary);
  const gpa = result.gpa != null ? result.gpa.toFixed(2) : '—';
  const rows = result.results ?? [];

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[styles.examName, { color: c.foreground }]}>{result.examTypeName}</Text>

      {/* GPA summary (brand gradient) */}
      <LinearGradient
        colors={[ramp[0], ramp[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gpaCard, { shadowColor: c.primary }]}
      >
        <View>
          <NpText style={styles.gpaLabel}>{t('results.gpa')}</NpText>
          <Text style={styles.gpaValue}>{gpa}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <NpText style={styles.gpaLabel}>{t('results.gradeRank')}</NpText>
          <Text style={styles.gpaGrade}>
            {result.overallGrade ?? '—'} · #{result.rank ?? '—'}
          </Text>
        </View>
      </LinearGradient>

      {/* Subject rows */}
      <View style={[styles.rowsCard, CARD_SHADOW, { backgroundColor: c.surface }]}>
        {rows.map((r, idx) => {
          const gc = gradeColors(r.grade);
          const last = idx === rows.length - 1;
          return (
            <View
              key={r.subjectId}
              style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: c.border }]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <NpText style={[styles.subject, { color: c.foreground }]}>{r.subjectName}</NpText>
                <NpText style={[styles.fullMark, { color: c.mutedForeground }]}>{t('results.fullMarks', { value: r.fullMark })}</NpText>
              </View>
              <Text style={[styles.obtained, { color: c.foreground }]}>{r.marksObtained ?? '—'}</Text>
              <View style={[styles.gradeChip, { backgroundColor: gc.bg }]}>
                <Text style={[styles.gradeChipText, { color: gc.fg }]}>{r.grade ?? '—'}</Text>
              </View>
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
              {results.map((r) => <ResultBlock key={`${r.examTypeId}-${r.studentId}`} result={r} />)}

              {/* Download report card PDF — mirrors the student results screen */}
              <TouchableOpacity
                onPress={download}
                disabled={downloading}
                activeOpacity={0.85}
                style={[styles.downloadBtn, { backgroundColor: c.brandSurface, borderColor: c.brandBorder }]}
              >
                <Ionicons name="download-outline" size={19} color={c.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.downloadBtnText, { color: c.primary }]}>
                  {downloading ? t('results.downloading') : t('results.downloadPdf')}
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

  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  examName: { fontFamily: FONT.extrabold, fontSize: 13, marginBottom: 10, marginLeft: 2 },

  gpaCard: {
    borderRadius: 18, padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 5,
  },
  gpaLabel: { fontFamily: FONT.bold, fontSize: 11, color: 'rgba(255,255,255,0.82)', textTransform: 'uppercase', letterSpacing: 0.6 },
  gpaValue: { fontFamily: FONT.extrabold, fontSize: 32, color: '#FFFFFF', marginTop: 2 },
  gpaGrade: { fontFamily: FONT.extrabold, fontSize: 24, color: '#FFFFFF', marginTop: 2 },

  rowsCard: { borderRadius: 16, paddingHorizontal: 14, marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  subject: { fontFamily: FONT.bold, fontSize: 13 },
  fullMark: { fontFamily: FONT.regular, fontSize: 10.5, marginTop: 1 },
  obtained: { fontFamily: FONT.extrabold, fontSize: 13.5 },
  gradeChip: { width: 38, alignItems: 'center', paddingVertical: 3, borderRadius: 7 },
  gradeChipText: { fontFamily: FONT.extrabold, fontSize: 11 },

  // Download PDF button — same treatment as the student results screen
  downloadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 48, borderRadius: 14, borderWidth: 1.5, marginTop: 4,
  },
  downloadBtnText: { fontFamily: FONT.bold, fontSize: 14 },
});
