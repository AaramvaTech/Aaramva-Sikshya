import { View, Text, ScrollView, RefreshControl, StatusBar, StyleSheet, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { adToBs, formatBs } from 'bs-calendar';
import { useMyAssignments } from '../../hooks/useAssignments';
import { EmptyState, ErrorState, LoadingBlock, ScreenHeader, StatusBadge } from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';
import { chipFor } from '../../lib/assignmentStatus';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import type { MyAssignment } from '../../types';

function dueBs(dueDate: string): string {
  return formatBs(adToBs(new Date(`${dueDate}T00:00:00`)), 'en');
}

function AssignmentCard({ a }: { a: MyAssignment }) {
  const c = useThemeColors();
  const chip = chipFor(a);
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: c.surface }, CARD_SHADOW]}
      activeOpacity={0.85}
      onPress={() =>
        router.push({ pathname: '/(student)/assignment-detail', params: { id: a.id } })
      }
    >
      <View style={styles.cardTop}>
        <Text style={[styles.subject, { color: c.primary }]}>{a.subjectName}</Text>
        <StatusBadge label={chip.label} bg={chip.bg} color={chip.color} />
      </View>
      <Text style={[styles.title, { color: c.foreground }]} numberOfLines={2}>
        {a.title}
      </Text>
      <View style={styles.cardBottom}>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={13} color={c.mutedForeground} />
          <Text style={[styles.meta, { color: c.mutedForeground }]}>Due {dueBs(a.dueDate)}</Text>
        </View>
        {a.attachmentKeys.length > 0 && (
          <View style={styles.metaItem}>
            <Ionicons name="attach-outline" size={14} color={c.mutedForeground} />
            <Text style={[styles.meta, { color: c.mutedForeground }]}>
              {a.attachmentKeys.length}
            </Text>
          </View>
        )}
        {a.mySubmission?.marks != null && (
          <Text style={[styles.marks, { color: c.primary }]}>{a.mySubmission.marks} marks</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function StudentAssignments() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, isError, refetch } = useMyAssignments();
  const c = useThemeColors();

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const pending = data?.filter((a) => !a.mySubmission) ?? [];
  const done = data?.filter((a) => a.mySubmission) ?? [];

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
          title="Assignments"
          subtitle="Homework from your teachers"
        />

        <View style={styles.body}>
          {isLoading ? (
            <LoadingBlock />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : !data?.length ? (
            <EmptyState
              icon="clipboard-outline"
              chip
              title="No assignments yet"
              subtitle="New homework from your teachers will show up here."
            />
          ) : (
            <>
              {pending.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { color: c.foreground }]}>To submit</Text>
                  {pending.map((a) => <AssignmentCard key={a.id} a={a} />)}
                </>
              )}
              {done.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { color: c.foreground }]}>Submitted</Text>
                  {done.map((a) => <AssignmentCard key={a.id} a={a} />)}
                </>
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
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 },
  sectionLabel: { fontFamily: FONT.bold, fontSize: 13, marginTop: 14, marginBottom: 8 },
  card: { borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  subject: { fontFamily: FONT.bold, fontSize: 12 },
  title: { fontFamily: FONT.semibold, fontSize: 15, marginBottom: 8 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontFamily: FONT.regular, fontSize: 12 },
  marks: { fontFamily: FONT.bold, fontSize: 12, marginLeft: 'auto' },
});
