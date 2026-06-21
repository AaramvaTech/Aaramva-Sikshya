import { View, Text, ScrollView, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMyChildren, useChildResults } from '../../hooks/useParentChild';
import { useAuthStore } from '../../store/auth';
import { useThemeColors, headerGradient } from '../../lib/theme/colors';
import { EmptyState, ErrorState, LoadingBlock } from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';
import { FONT } from '../../lib/theme/fonts';
import NpText from '../../components/NpText';
import type { ExamResult } from '../../types';

function gradeColors(g: string | null): { fg: string; bg: string } {
  if (!g) return { fg: '#7A8B82', bg: '#F1F4F1' };
  const u = g.toUpperCase();
  if (u === 'A+' || u === 'A') return { fg: '#0E9F77', bg: '#E4F6F1' };
  if (u === 'B+' || u === 'B') return { fg: '#5B7FE0', bg: '#EAF0FE' };
  return { fg: '#D9892B', bg: '#FEF3E2' };
}

function ResultBlock({ result }: { result: ExamResult }) {
  const c = useThemeColors();
  const ramp = headerGradient(c.primary);
  const gpa = result.gpa != null ? result.gpa.toFixed(2) : '—';
  const rows = result.results ?? [];

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[styles.examName, { color: c.foreground }]}>{result.examTypeName}</Text>

      {/* GPA summary (brand gradient) */}
      <LinearGradient
        colors={[ramp[1], ramp[2]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gpaCard, { shadowColor: c.primary }]}
      >
        <View>
          <Text style={styles.gpaLabel}>GPA</Text>
          <Text style={styles.gpaValue}>{gpa}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.gpaLabel}>Grade · Rank</Text>
          <Text style={styles.gpaGrade}>
            {result.overallGrade ?? '—'} · #{result.rank ?? '—'}
          </Text>
        </View>
      </LinearGradient>

      {/* Subject rows */}
      <View style={[styles.rowsCard, CARD_SHADOW]}>
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
                <Text style={[styles.fullMark, { color: c.mutedForeground }]}>Full marks {r.fullMark}</Text>
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
  const [refreshing, setRefreshing] = useState(false);
  const c = useThemeColors();
  const insets = useSafeAreaInsets();

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
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border },
          ]}
        >
          <Text style={[styles.headerTitle, { color: c.foreground }]}>Exam results</Text>
          {childName ? <NpText style={[styles.headerSub, { color: c.mutedForeground }]}>{childName}</NpText> : null}
        </View>

        <View style={styles.body}>
          {resultsQuery.isLoading ? (
            <LoadingBlock />
          ) : resultsQuery.isError ? (
            <View style={{ paddingTop: 24 }}>
              <ErrorState title="Failed to load results" onRetry={() => void resultsQuery.refetch()} />
            </View>
          ) : results.length === 0 ? (
            <View style={{ paddingTop: 24 }}>
              <EmptyState icon="ribbon-outline" title="No results yet" subtitle="Exam results will appear here once published." />
            </View>
          ) : (
            results.map((r) => <ResultBlock key={`${r.examTypeId}-${r.studentId}`} result={r} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  headerTitle: { fontFamily: FONT.extrabold, fontSize: 17 },
  headerSub: { fontFamily: FONT.regular, fontSize: 12, marginTop: 3 },

  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  examName: { fontFamily: FONT.extrabold, fontSize: 13, marginBottom: 10, marginLeft: 2 },

  gpaCard: {
    borderRadius: 18, padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 5,
  },
  gpaLabel: { fontFamily: FONT.bold, fontSize: 11, color: 'rgba(255,255,255,0.82)', textTransform: 'uppercase', letterSpacing: 0.6 },
  gpaValue: { fontFamily: FONT.extrabold, fontSize: 32, color: '#FFFFFF', marginTop: 2 },
  gpaGrade: { fontFamily: FONT.extrabold, fontSize: 24, color: '#FFFFFF', marginTop: 2 },

  rowsCard: { backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 14, marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  subject: { fontFamily: FONT.bold, fontSize: 13 },
  fullMark: { fontFamily: FONT.regular, fontSize: 10.5, marginTop: 1 },
  obtained: { fontFamily: FONT.extrabold, fontSize: 13.5 },
  gradeChip: { width: 38, alignItems: 'center', paddingVertical: 3, borderRadius: 7 },
  gradeChipText: { fontFamily: FONT.extrabold, fontSize: 11 },
});
