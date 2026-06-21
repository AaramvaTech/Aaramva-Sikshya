import { View, Text, Image, ScrollView, TouchableOpacity, StatusBar, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMyStaffProfile } from '../../hooks/useTeacher';
import { useAuthStore } from '../../store/auth';
import { useBranding } from '../../lib/theme/provider';
import { logout } from '../../lib/session';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import { LoadingBlock, ErrorState } from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';
import NpText from '../../components/NpText';
import { adToBs, formatBs } from 'bs-calendar';

export default function TeacherProfile() {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tenant = useAuthStore((s) => s.tenant);
  const { branding } = useBranding();
  const { data: p, isLoading, isError, refetch } = useMyStaffProfile();

  const schoolName = branding?.name ?? tenant?.name ?? 'Aaramva Shikshya';

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <View style={{ marginTop: 120 }}><LoadingBlock label="Loading…" /></View>
      </View>
    );
  }
  if (isError || !p) {
    return (
      <View style={[styles.root, { backgroundColor: c.background, justifyContent: 'center' }]}>
        <ErrorState title="Couldn't load your profile" onRetry={() => refetch()} />
      </View>
    );
  }

  const fullName = `${p.firstName} ${p.lastName}`;
  const initials = `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase();
  const desig = p.designationTitle ?? p.role ?? 'Teacher';
  let joined = p.joinDate;
  try { joined = `${formatBs(adToBs(new Date(p.joinDate)), 'en')} BS`; } catch { /* keep raw */ }

  const info: { k: string; v: string }[] = [
    { k: 'Employee ID', v: p.employeeId },
    { k: 'Department', v: p.departmentName ?? '—' },
    { k: 'Employment', v: p.employmentType },
    { k: 'Joined', v: joined },
  ];

  const actions: { icon: keyof typeof Ionicons.glyphMap; label: string; route: Href }[] = [
    { icon: 'stats-chart-outline', label: 'My attendance record', route: '/(teacher)/my-attendance' },
    { icon: 'document-text-outline', label: 'Apply for leave', route: '/(teacher)/leave' },
  ];

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero band */}
        <View
          style={[
            styles.band,
            { paddingTop: insets.top + 18, backgroundColor: c.brandSurface, borderBottomColor: c.brandBorder },
          ]}
        >
          <View style={styles.schoolRow}>
            {branding?.logoUrl ? (
              <View style={[styles.schoolChip, { backgroundColor: c.surface }]}>
                <Image source={{ uri: branding.logoUrl }} style={{ width: 18, height: 18 }} resizeMode="contain" />
              </View>
            ) : (
              <View style={[styles.schoolChip, { backgroundColor: c.primary }]}>
                <Text style={[styles.schoolChipText, { color: c.primaryForeground }]}>
                  {schoolName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')}
                </Text>
              </View>
            )}
            <NpText style={[styles.schoolName, { color: c.brandMuted }]}>{schoolName}</NpText>
          </View>

          {p.photoUrl ? (
            <Image source={{ uri: p.photoUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: c.primary }]}>
              <Text style={[styles.avatarText, { color: c.primaryForeground }]}>{initials}</Text>
            </View>
          )}
          <NpText style={[styles.name, { color: c.foreground }]}>{fullName}</NpText>
          <Text style={[styles.sub, { color: c.mutedForeground }]}>{desig}</Text>
        </View>

        <View style={styles.body}>
          {/* Info rows */}
          <View style={[styles.card, CARD_SHADOW]}>
            {info.map((r, idx) => (
              <View
                key={r.k}
                style={[styles.infoRow, idx < info.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}
              >
                <Text style={[styles.infoKey, { color: c.mutedForeground }]}>{r.k}</Text>
                <NpText style={[styles.infoVal, { color: c.foreground }]} numberOfLines={1}>{r.v}</NpText>
              </View>
            ))}
          </View>

          {/* Action rows */}
          <View style={[styles.card, CARD_SHADOW, { marginTop: 16 }]}>
            {actions.map((a, idx) => (
              <TouchableOpacity
                key={a.label}
                activeOpacity={0.7}
                onPress={() => router.push(a.route)}
                style={[styles.settingRow, idx < actions.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}
              >
                <Ionicons name={a.icon} size={20} color={c.primary} />
                <Text style={[styles.settingLabel, { color: c.foreground }]}>{a.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={c.border} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Sign out */}
          <TouchableOpacity
            style={[styles.signOut, { backgroundColor: `${c.danger}14`, borderColor: `${c.danger}40` }]}
            onPress={() => { void logout(); }}
            activeOpacity={0.85}
          >
            <Ionicons name="log-out-outline" size={19} color={c.danger} style={{ marginRight: 8 }} />
            <Text style={[styles.signOutText, { color: c.danger }]}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  band: { paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, alignItems: 'center' },
  schoolRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
  schoolChip: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  schoolChipText: { fontFamily: FONT.extrabold, fontSize: 10 },
  schoolName: { fontFamily: FONT.bold, fontSize: 12 },
  avatar: { width: 78, height: 78, borderRadius: 39 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: FONT.extrabold, fontSize: 26 },
  name: { fontFamily: FONT.extrabold, fontSize: 19, marginTop: 12 },
  sub: { fontFamily: FONT.regular, fontSize: 12, marginTop: 3 },

  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, gap: 12 },
  infoKey: { fontFamily: FONT.regular, fontSize: 12.5 },
  infoVal: { fontFamily: FONT.bold, fontSize: 12.5, flexShrink: 1, textAlign: 'right' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  settingLabel: { fontFamily: FONT.semibold, fontSize: 13, flex: 1 },
  signOut: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 48, marginTop: 16, borderRadius: 14, borderWidth: 1.5,
  },
  signOutText: { fontFamily: FONT.bold, fontSize: 14 },
});
