import {
  View, Text, ScrollView, Image, StatusBar, StyleSheet,
} from 'react-native';
import { router } from 'expo-router';

import { useMyStaffProfile } from '../../hooks/useTeacher';
import NpText from '../../components/NpText';
import Skeleton from '../../components/Skeleton';
import { CardLabel, ErrorState, ScreenHeader } from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import { adToBs, formatBs } from 'bs-calendar';

// A single label/value row inside an info card — mirrors comp tEditProfile visual language.
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

export default function TeacherProfileDetails() {
  const c = useThemeColors();
  const { data: p, isLoading, isError, refetch } = useMyStaffProfile();

  // ── Header ────────────────────────────────────────────────────────────────
  // Plain white detail bar with back button — matches comp tEditProfile header bar.
  const Header = (
    <ScreenHeader
      variant="bar"
      onBack={() => router.back()}
      title="Profile details"
      padH={16}
      padBottom={14}
    />
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
          <Skeleton style={{ height: 200, borderRadius: 16, marginBottom: 12 }} />
          <Skeleton style={{ height: 160, borderRadius: 16 }} />
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
  const fullName = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || p.email || 'Teacher';
  const initials = `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase()
    || (p.email?.[0] ?? 'T').toUpperCase();
  const desig = p.designationTitle ?? p.role ?? 'Teacher';

  // Format join date as BS if available.
  let joinedDisplay = '—';
  if (p.joinDate) {
    try { joinedDisplay = `${formatBs(adToBs(new Date(p.joinDate)), 'en')} BS`; } catch { joinedDisplay = p.joinDate; }
  }

  // Personal info rows — fields from StaffProfile that are personal in nature.
  const personalRows: { label: string; value: string }[] = [
    { label: 'First name', value: p.firstName ?? '—' },
    { label: 'Last name', value: p.lastName ?? '—' },
    { label: 'Email', value: p.email },
    ...(p.phone ? [{ label: 'Phone', value: p.phone }] : []),
    ...(p.gender ? [{ label: 'Gender', value: p.gender }] : []),
  ];

  // Employment info rows — comp tEditProfile shows employee id, department, designation, join date.
  const employmentRows: { label: string; value: string }[] = [
    { label: 'Employee ID', value: p.employeeId ?? '—' },
    { label: 'Designation', value: p.designationTitle ?? '—' },
    { label: 'Department', value: p.departmentName ?? '—' },
    { label: 'Employment type', value: p.employmentType ?? '—' },
    { label: 'Joined', value: joinedDisplay },
  ];

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      {Header}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
        {/* Avatar — comp tEditProfile line 1089 (avatar circle + initials / photo) */}
        <View style={styles.avatarWrap}>
          {p.photoUrl ? (
            <Image source={{ uri: p.photoUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: c.primary }]}>
              <Text style={[styles.avatarInitials, { color: c.primaryForeground }]}>{initials}</Text>
            </View>
          )}
          <NpText style={[styles.avatarName, { color: c.foreground }]}>{fullName}</NpText>
          <Text style={[styles.avatarSub, { color: c.mutedForeground }]}>{desig}</Text>
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

        {/* Employment info card */}
        <CardLabel style={{ marginTop: 20 }}>Employment</CardLabel>
        <View style={[styles.infoCard, CARD_SHADOW, { backgroundColor: c.surface }]}>
          {employmentRows.map((r, idx) => (
            <DetailRow
              key={r.label}
              label={r.label}
              value={r.value}
              isLast={idx === employmentRows.length - 1}
            />
          ))}
        </View>

        {/* Locked-field notice — mirrors comp tEditProfile line 1106 */}
        <Text style={[styles.lockedNote, { color: c.mutedForeground }]}>
          Locked fields are managed by your school.{'\n'}Contact the office to update them.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  body: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 36,
  },

  // Avatar block — comp tEditProfile line 1087–1093.
  avatarWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: { width: 84, height: 84, borderRadius: 42 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontFamily: FONT.extrabold, fontSize: 30 },
  avatarName: { fontFamily: FONT.extrabold, fontSize: 17, marginTop: 12 },
  avatarSub: { fontFamily: FONT.regular, fontSize: 12, marginTop: 3 },

  // Info card — comp field rows (label uppercase muted, value semibold).
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

  // Locked note — comp tEditProfile line 1106.
  lockedNote: {
    fontFamily: FONT.regular,
    fontSize: 10.5,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 20,
  },
});
