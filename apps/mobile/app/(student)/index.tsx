import {
  View,
  Text,
  Image,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';

import { useMyProfile, useMyTimetable, useMyAttendanceSummary } from '../../hooks/useStudentMe';
import { useAuthStore } from '../../store/auth';
import { logout } from '../../lib/session';
import { STATUS_CONFIG } from '../../lib/attendance';
import type { AttendanceStatus } from '../../lib/attendance';
import { todayBs, formatBs } from 'bs-calendar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning 👋';
  if (hour < 17) return 'Good Afternoon 👋';
  return 'Good Evening 👋';
}

function percentColor(p: number): string {
  if (p >= 75) return '#065f46';
  if (p >= 50) return '#d97706';
  return '#dc2626';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AttendanceCard({
  present,
  absent,
  late,
  leave,
  percent,
  totalWorkingDays,
}: {
  present: number;
  absent: number;
  late: number;
  leave: number;
  percent: number;
  totalWorkingDays: number;
}) {
  const color = percentColor(percent);

  const chips: { key: AttendanceStatus; count: number }[] = [
    { key: 'PRESENT', count: present },
    { key: 'ABSENT', count: absent },
    { key: 'LATE', count: late },
    { key: 'LEAVE', count: leave },
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>ATTENDANCE THIS YEAR</Text>

      <View style={styles.attendanceRow}>
        {/* Big percent */}
        <View style={styles.percentBox}>
          <Text style={[styles.percentText, { color }]}>{percent}%</Text>
          <Text style={styles.workingDaysText}>{totalWorkingDays} working days</Text>
        </View>

        {/* Stat chips */}
        <View style={styles.chipsGrid}>
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

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.min(percent, 100)}%` as `${number}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

function TimetableCard({
  isSchoolDay,
  periods,
}: {
  isSchoolDay: boolean;
  periods: {
    slotId: string;
    periodNumber: number;
    startTime: string;
    endTime: string;
    subject: { id: string; name: string; code: string | null };
    teacher: { id: string; fullName: string };
    room: string | null;
  }[];
}) {
  const empty = !isSchoolDay || periods.length === 0;

  return (
    <View style={[styles.card, { marginBottom: 32 }]}>
      <Text style={styles.cardLabel}>TODAY'S CLASSES</Text>

      {empty ? (
        <View style={styles.emptyState}>
          <Ionicons name="moon-outline" size={40} color="#d1d5db" />
          <Text style={styles.emptyText}>No classes today</Text>
        </View>
      ) : (
        periods.map((p, idx) => (
          <View
            key={p.slotId}
            style={[
              styles.periodRow,
              idx < periods.length - 1 && styles.periodBorder,
            ]}
          >
            {/* Period number badge */}
            <View style={styles.periodBadge}>
              <Text style={styles.periodBadgeText}>{p.periodNumber}</Text>
            </View>

            <View style={styles.periodInfo}>
              <View style={styles.periodTopRow}>
                <Text style={styles.subjectName}>{p.subject.name}</Text>
                <Text style={styles.timeText}>
                  {p.startTime}–{p.endTime}
                </Text>
              </View>
              <Text style={styles.teacherText}>
                {p.teacher.fullName}
                {p.room ? ` · Room ${p.room}` : ''}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function StudentDashboard() {
  const [refreshing, setRefreshing] = useState(false);
  const tenant = useAuthStore((s) => s.tenant);

  const profile = useMyProfile();
  const timetable = useMyTimetable();
  const summary = useMyAttendanceSummary();

  const isLoading = profile.isLoading || timetable.isLoading || summary.isLoading;
  const isError = profile.isError || timetable.isError || summary.isError;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([profile.refetch(), timetable.refetch(), summary.refetch()]);
    setRefreshing(false);
  };

  const handleLogout = () => {
    void logout();
  };

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <View style={styles.centerFill}>
        <ActivityIndicator size="large" color="#065f46" />
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  if (isError) {
    return (
      <View style={styles.centerFill}>
        <Ionicons name="cloud-offline-outline" size={52} color="#d1d5db" />
        <Text style={styles.errorTitle}>Failed to load</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            void profile.refetch();
            void timetable.refetch();
            void summary.refetch();
          }}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const p = profile.data;
  const t = timetable.data;
  const s = summary.data;

  const fullName = p ? `${p.firstName} ${p.lastName}` : '';
  const enrollment = p?.currentEnrollment ?? null;

  let enrollmentLine = 'Not enrolled';
  if (enrollment) {
    const parts = [`Class ${enrollment.className}`, `Section ${enrollment.sectionName}`];
    if (enrollment.rollNumber !== null) parts.push(`Roll ${enrollment.rollNumber}`);
    enrollmentLine = parts.join(' · ');
  }

  const todayLabel = `Today: ${formatBs(todayBs(), 'en')}`;

  return (
    <ScrollView
      style={styles.root}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#065f46" />
      }
    >
      {/* ------------------------------------------------------------------ */}
      {/* Gradient Header                                                     */}
      {/* ------------------------------------------------------------------ */}
      <LinearGradient
        colors={['#064e3b', '#065f46', '#047857']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        {/* Top row: logo + logout */}
        <View style={styles.headerTopRow}>
          <Image
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            source={require('../../assets/images/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} accessibilityLabel="Logout">
            <Ionicons name="log-out-outline" size={18} color="white" />
          </TouchableOpacity>
        </View>

        {/* BS Date */}
        <Text style={styles.bsDate}>{todayLabel}</Text>

        {/* Greeting */}
        <Text style={styles.greeting}>{getGreeting()}</Text>

        {/* Student name */}
        <Text style={styles.studentName}>{fullName}</Text>

        {/* Enrollment */}
        <Text style={styles.enrollmentLine}>{enrollmentLine}</Text>

        {/* Tenant name */}
        {tenant?.name ? (
          <Text style={styles.tenantName}>{tenant.name}</Text>
        ) : null}
      </LinearGradient>

      {/* ------------------------------------------------------------------ */}
      {/* Cards (overlap header)                                              */}
      {/* ------------------------------------------------------------------ */}
      <View style={styles.cardsContainer}>
        {/* Attendance summary */}
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

        {/* Timetable */}
        <TimetableCard
          isSchoolDay={t?.isSchoolDay ?? false}
          periods={t?.periods ?? []}
        />
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centerFill: {
    flex: 1,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    color: '#374151',
    fontWeight: '600',
    marginTop: 12,
    fontSize: 16,
  },
  retryButton: {
    backgroundColor: '#065f46',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 16,
  },
  retryText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },

  // Header
  header: {
    paddingTop: 56,
    paddingBottom: 80,
    paddingHorizontal: 20,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  logo: {
    width: 120,
    height: 30,
  },
  logoutBtn: {
    padding: 8,
  },
  bsDate: {
    color: '#6ee7b7',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  greeting: {
    color: '#a7f3d0',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  studentName: {
    color: 'white',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 4,
  },
  enrollmentLine: {
    color: '#d1fae5',
    fontSize: 13,
    fontWeight: '500',
  },
  tenantName: {
    color: '#a7f3d0',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },

  // Cards container — overlaps header
  cardsContainer: {
    marginTop: -60,
    paddingHorizontal: 16,
  },

  // Shared card
  card: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardLabel: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },

  // Attendance card
  attendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  percentBox: {
    flex: 1,
    marginRight: 12,
  },
  percentText: {
    fontSize: 36,
    fontWeight: '800',
  },
  workingDaysText: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '500',
    marginTop: 2,
  },
  chipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
    flex: 1,
  },
  chip: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 44,
  },
  chipCount: {
    fontSize: 16,
    fontWeight: '800',
  },
  chipLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 1,
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#f3f4f6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },

  // Timetable card
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 10,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  periodBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  periodBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#d1fae5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  periodBadgeText: {
    color: '#065f46',
    fontSize: 12,
    fontWeight: '800',
  },
  periodInfo: {
    flex: 1,
  },
  periodTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  subjectName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  timeText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  teacherText: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '400',
  },
});
