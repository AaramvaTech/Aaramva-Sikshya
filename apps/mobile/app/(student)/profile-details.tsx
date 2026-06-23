import {
  View, Text, ScrollView, TouchableOpacity, Image, StatusBar, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMyProfile } from '../../hooks/useStudentMe';
import NpText from '../../components/NpText';
import Skeleton from '../../components/Skeleton';
import { Card, CardLabel, EmptyState, ErrorState, LoadingBlock } from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

// A single label/value row inside an info card, matching the comp sEditProfile visual language.
function DetailRow({
  label,
  value,
  isLast,
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) {
  const c = useThemeColors();
  return (
    <View
      style={[
        styles.row,
        !isLast && { borderBottomWidth: 1, borderBottomColor: c.border },
      ]}
    >
      <Text style={[styles.rowLabel, { color: c.mutedForeground }]}>{label}</Text>
      <NpText style={[styles.rowValue, { color: c.foreground }]}>{value}</NpText>
    </View>
  );
}

export default function StudentProfileDetails() {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { data: p, isLoading, isError, refetch } = useMyProfile();

  // ── Header ────────────────────────────────────────────────────────────────
  // Plain white header with back button — matches comp sEditProfile header bar
  // (line 507) and the results-screen pattern.
  const Header = (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + 14, backgroundColor: c.surface, borderBottomColor: c.border },
      ]}
    >
      <TouchableOpacity
        onPress={() => router.back()}
        hitSlop={10}
        style={[styles.backBtn, { backgroundColor: c.background }]}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={20} color={c.primary} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: c.foreground }]}>Profile details</Text>
    </View>
  );

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <StatusBar barStyle="dark-content" />
        {Header}
        <ScrollView contentContainerStyle={styles.body}>
          <Skeleton style={{ height: 88, borderRadius: 44, alignSelf: 'center', width: 88, marginBottom: 16 }} />
          <Skeleton style={{ height: 48, borderRadius: 12, marginBottom: 12 }} />
          <Skeleton style={{ height: 160, borderRadius: 16, marginBottom: 12 }} />
          <Skeleton style={{ height: 120, borderRadius: 16 }} />
        </ScrollView>
      </View>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (isError || !p) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <StatusBar barStyle="dark-content" />
        {Header}
        <View style={[styles.body, { justifyContent: 'center', flex: 1 }]}>
          <ErrorState title="Couldn't load profile" onRetry={() => refetch()} />
        </View>
      </View>
    );
  }

  // ── Data ─────────────────────────────────────────────────────────────────
  const fullName = `${p.firstName} ${p.lastName}`;
  const initials = `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase();
  const e = p.currentEnrollment;

  // Personal info rows — only fields the StudentProfile type actually provides.
  // Comp shows firstName, lastName, phone, gender; we include all that are present.
  const personalRows: { label: string; value: string }[] = [
    { label: 'First name', value: p.firstName },
    { label: 'Last name', value: p.lastName },
    ...(p.phone ? [{ label: 'Phone', value: p.phone }] : []),
    ...(p.gender ? [{ label: 'Gender', value: p.gender }] : []),
  ];

  // Enrollment info rows — comp shows class/section, roll number, admission no.
  const enrollmentRows: { label: string; value: string }[] = [
    { label: 'Admission no.', value: p.admissionNumber },
    { label: 'Class / Section', value: e ? `${e.className} · ${e.sectionName}` : '—' },
    { label: 'Roll number', value: e?.rollNumber != null ? String(e.rollNumber) : '—' },
    { label: 'Academic year', value: e?.academicYearName ?? '—' },
  ];

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      {Header}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
        {/* Avatar — comp line 512–516 (avatar circle + initials / photo) */}
        <View style={styles.avatarWrap}>
          {p.photoUrl ? (
            <Image source={{ uri: p.photoUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: c.primary }]}>
              <Text style={[styles.avatarInitials, { color: c.primaryForeground }]}>{initials}</Text>
            </View>
          )}
          <NpText style={[styles.avatarName, { color: c.foreground }]}>{fullName}</NpText>
          {e ? (
            <Text style={[styles.avatarSub, { color: c.mutedForeground }]}>
              {e.className} {e.sectionName}
              {e.rollNumber != null ? ` · Roll ${e.rollNumber}` : ''}
            </Text>
          ) : null}
        </View>

        {/* Personal info card */}
        <CardLabel>Personal information</CardLabel>
        <View style={[styles.infoCard, CARD_SHADOW, { backgroundColor: c.surface }]}>
          {personalRows.map((r, idx) => (
            <DetailRow
              key={r.label}
              label={r.label}
              value={r.value}
              isLast={idx === personalRows.length - 1}
            />
          ))}
        </View>

        {/* Enrollment info card */}
        <CardLabel style={{ marginTop: 20 }}>Enrollment</CardLabel>
        <View style={[styles.infoCard, CARD_SHADOW, { backgroundColor: c.surface }]}>
          {enrollmentRows.map((r, idx) => (
            <DetailRow
              key={r.label}
              label={r.label}
              value={r.value}
              isLast={idx === enrollmentRows.length - 1}
            />
          ))}
        </View>

        {/* Locked-field notice — mirrors comp line 529 (read-only message) */}
        <Text style={[styles.lockedNote, { color: c.mutedForeground }]}>
          Profile information is managed by your school.{'\n'}Contact the office to request changes.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header — white band with back button (comp sEditProfile line 506–508).
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONT.extrabold,
    fontSize: 16,
  },

  body: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 36,
  },

  // Avatar block — comp line 510–516.
  avatarWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: { width: 84, height: 84, borderRadius: 42 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontFamily: FONT.extrabold, fontSize: 30 },
  avatarName: { fontFamily: FONT.extrabold, fontSize: 17, marginTop: 12 },
  avatarSub: { fontFamily: FONT.regular, fontSize: 12, marginTop: 3 },

  // Info card — comp field rows (label uppercase, value semibold).
  infoCard: {
    borderRadius: 16,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  row: {
    paddingVertical: 14,
  },
  rowLabel: {
    fontFamily: FONT.bold,
    fontSize: 10.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  rowValue: {
    fontFamily: FONT.semibold,
    fontSize: 13.5,
  },

  // Locked note — comp line 529.
  lockedNote: {
    fontFamily: FONT.regular,
    fontSize: 10.5,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 20,
  },
});
