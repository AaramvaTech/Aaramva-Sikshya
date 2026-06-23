import { View, Text, ScrollView, TouchableOpacity, StatusBar, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMyChildren } from '../../hooks/useParentChild';
import { useAuthStore } from '../../store/auth';
import NpText from '../../components/NpText';
import { CardLabel, ErrorState, LoadingBlock } from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

// "ramesh.shrestha@gmail.com" -> "Ramesh Shrestha"
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

// A single label/value row inside an info card — mirrors comp pEditProfile visual language.
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

export default function ParentProfileDetails() {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const { data: children, isLoading, isError, refetch } = useMyChildren();

  const email = user?.email ?? '';
  const guardianName = email ? nameFromEmail(email) : 'Parent';
  const initials = guardianName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const relation = children?.[0]?.relation ?? 'Guardian';

  // ── Header ────────────────────────────────────────────────────────────────
  // Plain white header with back button — matches comp pEditProfile header bar.
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
          <View style={styles.avatarWrap}>
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: c.border }]} />
          </View>
          <LoadingBlock />
        </ScrollView>
      </View>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (isError) {
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
  // Guardian info rows — only fields with real backing data are shown.
  // Data gaps: phone, address, gender — no endpoint exposes these for a guardian.
  const guardianRows: { label: string; value: string }[] = [
    { label: 'Name', value: guardianName },
    { label: 'Email', value: email || '—' },
    { label: 'Relation', value: relation },
  ];

  const childList = children ?? [];

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      {Header}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
        {/* Avatar — comp pEditProfile avatar circle + initials */}
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: c.primary }]}>
            <Text style={[styles.avatarInitials, { color: c.primaryForeground }]}>{initials}</Text>
          </View>
          <NpText style={[styles.avatarName, { color: c.foreground }]}>{guardianName}</NpText>
          <Text style={[styles.avatarSub, { color: c.mutedForeground }]}>{relation}</Text>
        </View>

        {/* Guardian information card */}
        <CardLabel>Guardian information</CardLabel>
        <View style={[styles.infoCard, CARD_SHADOW, { backgroundColor: c.surface }]}>
          {guardianRows.map((r, idx) => (
            <DetailRow
              key={r.label}
              label={r.label}
              value={r.value}
              isLast={idx === guardianRows.length - 1}
            />
          ))}
        </View>

        {/* Linked children card */}
        <CardLabel style={{ marginTop: 20 }}>Linked children</CardLabel>
        {childList.length === 0 ? (
          <View style={[styles.infoCard, CARD_SHADOW, { backgroundColor: c.surface }]}>
            <View style={styles.row}>
              <Text style={[styles.rowValue, { color: c.mutedForeground }]}>No children linked</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.infoCard, CARD_SHADOW, { backgroundColor: c.surface }]}>
            {childList.map((ch, idx) => {
              const e = ch.currentEnrollment;
              const classSub = e
                ? `Class ${e.className}${e.sectionName}${e.rollNumber != null ? ` · Roll ${e.rollNumber}` : ''}`
                : 'Not enrolled';
              const ci = `${ch.firstName[0] ?? ''}${ch.lastName[0] ?? ''}`.toUpperCase();
              return (
                <View
                  key={ch.id}
                  style={[
                    styles.childRow,
                    idx < childList.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border },
                  ]}
                >
                  <View style={[styles.childAvatar, { backgroundColor: c.brandSurface }]}>
                    <Text style={[styles.childInit, { color: c.primary }]}>{ci}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <NpText style={[styles.childName, { color: c.foreground }]}>
                      {ch.firstName} {ch.lastName}
                    </NpText>
                    <Text style={[styles.childSub, { color: c.mutedForeground }]}>{classSub}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Locked-field notice — mirrors comp pEditProfile footer note */}
        <Text style={[styles.lockedNote, { color: c.mutedForeground }]}>
          Locked fields are managed by your school.{'\n'}Contact the office to update them.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header — white band with back button (comp pEditProfile header bar).
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

  // Avatar block — comp pEditProfile avatar circle + initials.
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

  // Children rows.
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  childAvatar: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childInit: { fontFamily: FONT.extrabold, fontSize: 13 },
  childName: { fontFamily: FONT.bold, fontSize: 13 },
  childSub: { fontFamily: FONT.regular, fontSize: 11, marginTop: 1 },

  // Locked note — comp pEditProfile footer.
  lockedNote: {
    fontFamily: FONT.regular,
    fontSize: 10.5,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 20,
  },
});
