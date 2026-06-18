import {
  View, Text, Image, ScrollView, ActivityIndicator,
  TouchableOpacity, RefreshControl, StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { todayBs, formatBs } from 'bs-calendar';

import { useMyChildren, useChildAttendanceSummary, useChildTimetable } from '../../hooks/useParentChild';
import { useAuthStore } from '../../store/auth';
import { logout } from '../../lib/session';
import { STATUS_CONFIG } from '../../lib/attendance';
import type { AttendanceStatus } from '../../lib/attendance';
import type { MyChild } from '../../types';

// ─── Child picker ─────────────────────────────────────────────────────────────

function ChildPicker({ children, selectedId, onSelect }: {
  children: MyChild[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (children.length <= 1) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.childScrollRow}>
      {children.map((c) => {
        const selected = c.id === selectedId;
        return (
          <TouchableOpacity
            key={c.id}
            style={[styles.childChip, selected && styles.childChipActive]}
            onPress={() => onSelect(c.id)}
          >
            <Text style={[styles.childChipText, selected && styles.childChipTextActive]}>
              {c.firstName} {c.lastName}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─── Attendance card ──────────────────────────────────────────────────────────

function AttendanceCard({ present, absent, late, leave, percent, totalWorkingDays }: {
  present: number; absent: number; late: number; leave: number;
  percent: number; totalWorkingDays: number;
}) {
  const color = percent >= 75 ? '#1e3a5f' : percent >= 50 ? '#d97706' : '#dc2626';
  const chips: { key: AttendanceStatus; count: number }[] = [
    { key: 'PRESENT', count: present },
    { key: 'ABSENT', count: absent },
    { key: 'LATE', count: late },
    { key: 'LEAVE', count: leave },
  ];
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>ATTENDANCE THIS YEAR</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
        <View style={{ flex: 1 }}>
          <Text style={[{ fontSize: 36, fontWeight: '800' }, { color }]}>{percent}%</Text>
          <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '500', marginTop: 2 }}>
            {totalWorkingDays} working days
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', flex: 1 }}>
          {chips.map(({ key, count }) => {
            const cfg = STATUS_CONFIG[key];
            return (
              <View key={key} style={[styles.chip, { backgroundColor: cfg.bg }]}>
                <Text style={[styles.chipCount, { color: cfg.color }]}>{count}</Text>
                <Text style={[styles.chipLabel, { color: cfg.color }]}>{cfg.shortCode}</Text>
              </View>
            );
          })}
        </View>
      </View>
      <View style={{ height: 6, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
        <View style={{
          height: 6, borderRadius: 3,
          width: `${Math.min(percent, 100)}%` as `${number}%`,
          backgroundColor: color,
        }} />
      </View>
    </View>
  );
}

// ─── Timetable card ───────────────────────────────────────────────────────────

function TimetableCard({ todayDow, slots }: {
  todayDow: number;
  slots: { slotId: string; dayOfWeek: number; periodNumber: number; startTime: string; endTime: string; subject: { name: string }; teacher: { fullName: string }; room: string | null }[];
}) {
  const todaySlots = slots.filter((s) => s.dayOfWeek === todayDow)
    .sort((a, b) => a.periodNumber - b.periodNumber);

  return (
    <View style={[styles.card, { marginBottom: 32 }]}>
      <Text style={styles.cardLabel}>TODAY'S CLASSES</Text>
      {todaySlots.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Ionicons name="moon-outline" size={40} color="#d1d5db" />
          <Text style={{ color: '#9ca3af', fontSize: 14, fontWeight: '500', marginTop: 10 }}>
            No classes today
          </Text>
        </View>
      ) : (
        todaySlots.map((p, idx) => (
          <View
            key={p.slotId}
            style={[
              { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12 },
              idx < todaySlots.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
            ]}
          >
            <View style={styles.periodBadge}>
              <Text style={styles.periodBadgeText}>{p.periodNumber}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', flex: 1, marginRight: 8 }}>
                  {p.subject.name}
                </Text>
                <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: '500' }}>
                  {p.startTime}–{p.endTime}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: '#9ca3af' }}>
                {p.teacher.fullName}{p.room ? ` · Room ${p.room}` : ''}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ParentDashboard() {
  const [refreshing, setRefreshing] = useState(false);
  const tenant = useAuthStore((s) => s.tenant);
  const selectedChildId = useAuthStore((s) => s.selectedChildId);
  const setSelectedChildId = useAuthStore((s) => s.setSelectedChildId);

  const childrenQuery = useMyChildren();
  const children = childrenQuery.data ?? [];

  const effectiveChildId: string | null =
    selectedChildId ??
    (children.length > 0 ? children[0].id : null);

  // Auto-persist first-child selection into store
  if (!selectedChildId && effectiveChildId) {
    setSelectedChildId(effectiveChildId);
  }

  const selectedChild = children.find((c) => c.id === effectiveChildId) ?? null;
  const sectionId = selectedChild?.currentEnrollment?.sectionId ?? null;
  const academicYearId = selectedChild?.currentEnrollment?.academicYearId ?? null;

  const summaryQuery = useChildAttendanceSummary(effectiveChildId ?? '', academicYearId);
  const timetableQuery = useChildTimetable(sectionId);

  const isLoading = childrenQuery.isLoading;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      childrenQuery.refetch(),
      summaryQuery.refetch(),
      timetableQuery.refetch(),
    ]);
    setRefreshing(false);
  };

  const todayDow = new Date().getDay(); // 0 = Sunday
  // Saturday (6) → no school
  const isSchoolDay = todayDow !== 6;

  if (isLoading) {
    return (
      <View style={styles.centerFill}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  if (childrenQuery.isError) {
    return (
      <View style={styles.centerFill}>
        <Ionicons name="cloud-offline-outline" size={52} color="#d1d5db" />
        <Text style={{ color: '#374151', fontWeight: '600', marginTop: 12, fontSize: 16 }}>
          Failed to load
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void childrenQuery.refetch()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (children.length === 0) {
    return (
      <View style={styles.centerFill}>
        <Ionicons name="people-outline" size={52} color="#d1d5db" />
        <Text style={{ color: '#374151', fontWeight: '600', marginTop: 12, fontSize: 16 }}>
          No children linked
        </Text>
        <Text style={{ color: '#9ca3af', fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 }}>
          Ask your school to link your guardian account to your child&apos;s profile.
        </Text>
      </View>
    );
  }

  const s = summaryQuery.data;
  const slots = timetableQuery.data ?? [];
  const todayLabel = `Today: ${formatBs(todayBs(), 'en')}`;
  const childName = selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : '';
  const enrollmentLine = selectedChild?.currentEnrollment
    ? `Class ${selectedChild.currentEnrollment.className} · Section ${selectedChild.currentEnrollment.sectionName}`
    : 'Not enrolled';

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
        style={styles.header}
      >
        <View style={styles.headerTopRow}>
          <Image
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            source={require('../../assets/images/logo.png')}
            style={{ width: 120, height: 30 }}
            resizeMode="contain"
          />
          <TouchableOpacity onPress={() => void logout()} style={{ padding: 8 }}>
            <Ionicons name="log-out-outline" size={18} color="white" />
          </TouchableOpacity>
        </View>

        <Text style={{ color: '#93c5fd', fontSize: 12, fontWeight: '600', marginBottom: 4 }}>
          {todayLabel}
        </Text>

        {tenant?.name ? (
          <Text style={{ color: '#bfdbfe', fontSize: 11, fontWeight: '500', marginBottom: 8 }}>
            {tenant.name}
          </Text>
        ) : null}

        <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 2 }}>
          {childName}
        </Text>
        <Text style={{ color: '#bfdbfe', fontSize: 13, fontWeight: '500' }}>
          {enrollmentLine}
        </Text>

        {/* Child picker for multi-child parents */}
        <ChildPicker
          children={children}
          selectedId={effectiveChildId}
          onSelect={setSelectedChildId}
        />
      </LinearGradient>

      <View style={styles.cardsContainer}>
        {s && (
          <AttendanceCard
            present={s.present}
            absent={s.absent}
            late={s.late}
            leave={s.leave}
            percent={s.attendancePercent}
            totalWorkingDays={s.totalWorkingDays}
          />
        )}

        {!summaryQuery.isLoading && !s && (
          <View style={[styles.card, { alignItems: 'center', paddingVertical: 24 }]}>
            <Ionicons name="stats-chart-outline" size={36} color="#d1d5db" />
            <Text style={{ color: '#9ca3af', fontSize: 13, marginTop: 8 }}>
              Attendance data unavailable
            </Text>
          </View>
        )}

        <TimetableCard
          todayDow={isSchoolDay ? todayDow : -1}
          slots={slots}
        />
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafb' },
  centerFill: {
    flex: 1, backgroundColor: '#f9fafb',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  retryBtn: {
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 14, marginTop: 16,
  },
  retryText: { color: 'white', fontWeight: '700', fontSize: 14 },

  header: {
    paddingTop: 56, paddingBottom: 80, paddingHorizontal: 20,
  },
  headerTopRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 16,
  },

  childScrollRow: { marginTop: 16 },
  childChip: {
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.12)', marginRight: 8,
  },
  childChipActive: { backgroundColor: 'rgba(255,255,255,0.9)' },
  childChipText: { color: '#bfdbfe', fontSize: 13, fontWeight: '600' },
  childChipTextActive: { color: '#1e3a5f' },

  cardsContainer: { marginTop: -60, paddingHorizontal: 16 },

  card: {
    backgroundColor: 'white', borderRadius: 24, padding: 20, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  cardLabel: {
    fontSize: 11, color: '#6b7280', fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14,
  },
  chip: {
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    alignItems: 'center', minWidth: 44,
  },
  chipCount: { fontSize: 16, fontWeight: '800' },
  chipLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', marginTop: 1 },
  periodBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#dbeafe', alignItems: 'center',
    justifyContent: 'center', marginRight: 12, marginTop: 2,
  },
  periodBadgeText: { color: '#1e3a5f', fontSize: 12, fontWeight: '800' },
});
