import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';

import { useMyChildren, useChildResults } from '../../hooks/useParentChild';
import { useAuthStore } from '../../store/auth';
import type { ExamResult } from '../../types';

function ResultCard({ result }: { result: ExamResult }) {
  const [expanded, setExpanded] = useState(false);

  const gradeColor = (g: string | null) => {
    if (!g) return '#6b7280';
    const upper = g.toUpperCase();
    if (upper === 'A+' || upper === 'A') return '#065f46';
    if (upper === 'B+' || upper === 'B') return '#1e3a5f';
    if (upper === 'C' || upper === 'C+') return '#d97706';
    return '#dc2626';
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setExpanded(!expanded)}
      style={styles.resultCard}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>
            {result.examTypeName}
          </Text>
          {result.percentage !== null && (
            <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              {result.percentage.toFixed(1)}% · Rank #{result.rank ?? '—'}
            </Text>
          )}
        </View>
        {result.overallGrade && (
          <View style={[styles.gradeBadge, { borderColor: gradeColor(result.overallGrade) }]}>
            <Text style={[styles.gradeText, { color: gradeColor(result.overallGrade) }]}>
              {result.overallGrade}
            </Text>
          </View>
        )}
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18} color="#9ca3af"
          style={{ marginLeft: 8 }}
        />
      </View>

      {expanded && (
        <View style={styles.subjectTable}>
          <View style={[styles.subjectRow, { backgroundColor: '#f3f4f6' }]}>
            <Text style={[styles.subjectCell, { flex: 2, fontWeight: '700', color: '#374151' }]}>Subject</Text>
            <Text style={[styles.subjectCell, styles.numCell, { fontWeight: '700', color: '#374151' }]}>FM</Text>
            <Text style={[styles.subjectCell, styles.numCell, { fontWeight: '700', color: '#374151' }]}>Marks</Text>
            <Text style={[styles.subjectCell, styles.numCell, { fontWeight: '700', color: '#374151' }]}>Grade</Text>
          </View>
          {result.results.map((r, idx) => (
            <View
              key={r.subjectId}
              style={[styles.subjectRow, idx % 2 === 1 && { backgroundColor: '#f9fafb' }]}
            >
              <Text style={[styles.subjectCell, { flex: 2, color: '#374151' }]} numberOfLines={1}>
                {r.subjectName}
              </Text>
              <Text style={[styles.subjectCell, styles.numCell, { color: '#6b7280' }]}>{r.fullMark}</Text>
              <Text style={[styles.subjectCell, styles.numCell, { color: '#111827', fontWeight: '600' }]}>
                {r.marksObtained ?? '—'}
              </Text>
              <Text style={[styles.subjectCell, styles.numCell, { color: gradeColor(r.grade), fontWeight: '700' }]}>
                {r.grade ?? '—'}
              </Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function ParentResults() {
  const [refreshing, setRefreshing] = useState(false);

  const selectedChildId = useAuthStore((s) => s.selectedChildId);
  const setSelectedChildId = useAuthStore((s) => s.setSelectedChildId);
  const childrenQuery = useMyChildren();
  const children = childrenQuery.data ?? [];
  const effectiveChildId: string | null = selectedChildId ?? (children[0]?.id ?? null);
  if (!selectedChildId && effectiveChildId) setSelectedChildId(effectiveChildId);
  const selectedChild = children.find((c) => c.id === effectiveChildId) ?? null;

  const resultsQuery = useChildResults(effectiveChildId ?? '');
  const results = resultsQuery.data ?? [];

  const onRefresh = async () => {
    setRefreshing(true);
    await resultsQuery.refetch();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.root}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1e3a5f" />}
    >
      <LinearGradient
        colors={['#0f172a', '#1e3a5f', '#1e40af']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: 56, paddingBottom: 72, paddingHorizontal: 20 }}
      >
        <Text style={{ color: '#93c5fd', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          {selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : 'Results'}
        </Text>
        <Text style={{ color: 'white', fontSize: 24, fontWeight: '800' }}>Exam Results</Text>

        {children.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
            {children.map((c) => {
              const sel = c.id === effectiveChildId;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={{
                    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
                    backgroundColor: sel ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.12)',
                    marginRight: 8,
                  }}
                  onPress={() => setSelectedChildId(c.id)}
                >
                  <Text style={{ color: sel ? '#1e3a5f' : '#bfdbfe', fontSize: 13, fontWeight: '600' }}>
                    {c.firstName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </LinearGradient>

      <View style={{ marginTop: -52, paddingHorizontal: 16, paddingBottom: 32 }}>
        {resultsQuery.isLoading ? (
          <View style={[styles.card, { alignItems: 'center', paddingVertical: 40 }]}>
            <ActivityIndicator size="small" color="#1e3a5f" />
          </View>
        ) : resultsQuery.isError ? (
          <View style={[styles.card, { alignItems: 'center', paddingVertical: 32 }]}>
            <Ionicons name="cloud-offline-outline" size={40} color="#d1d5db" />
            <Text style={{ color: '#374151', fontWeight: '600', marginTop: 12 }}>Failed to load results</Text>
            <TouchableOpacity
              onPress={() => void resultsQuery.refetch()}
              style={{ backgroundColor: '#1e3a5f', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, marginTop: 12 }}
            >
              <Text style={{ color: 'white', fontWeight: '700' }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : results.length === 0 ? (
          <View style={[styles.card, { alignItems: 'center', paddingVertical: 40 }]}>
            <Ionicons name="ribbon-outline" size={44} color="#d1d5db" />
            <Text style={{ color: '#374151', fontWeight: '600', fontSize: 16, marginTop: 12 }}>
              No results yet
            </Text>
            <Text style={{ color: '#9ca3af', fontSize: 13, marginTop: 6, textAlign: 'center' }}>
              Exam results will appear here once published.
            </Text>
          </View>
        ) : (
          results.map((r) => <ResultCard key={`${r.examTypeId}-${r.studentId}`} result={r} />)
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafb' },
  card: {
    backgroundColor: 'white', borderRadius: 24, padding: 20, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  resultCard: {
    backgroundColor: 'white', borderRadius: 20, padding: 18, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
  },
  gradeBadge: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  gradeText: { fontSize: 14, fontWeight: '800' },
  subjectTable: { marginTop: 8, borderRadius: 12, overflow: 'hidden' },
  subjectRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  subjectCell: { fontSize: 12, flex: 1, color: '#374151' },
  numCell: { flex: 0.7, textAlign: 'center' },
});
