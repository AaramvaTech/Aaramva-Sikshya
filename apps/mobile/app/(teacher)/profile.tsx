import { View, Text, Image, ScrollView, TouchableOpacity, StatusBar, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';

import { useMyStaffProfile } from '../../hooks/useTeacher';
import { useAuthStore } from '../../store/auth';
import { useBranding } from '../../lib/theme/provider';
import { logout } from '../../lib/session';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import { ErrorState, ScreenHeader } from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';
import NpText from '../../components/NpText';
import Skeleton from '../../components/Skeleton';
import { adToBs, formatBs } from 'bs-calendar';

export default function TeacherProfile() {
  const c = useThemeColors();
  const router = useRouter();
  const tenant = useAuthStore((s) => s.tenant);
  const { branding } = useBranding();
  const { data: p, isLoading, isError, refetch } = useMyStaffProfile();

  const schoolName = branding?.name ?? tenant?.name ?? 'Aaramva Shikshya';

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <StatusBar barStyle="dark-content" />
        <Skeleton style={{ height: 230 }} className="rounded-none" />
        <View style={{ paddingHorizontal: 16, marginTop: 16, gap: 12 }}>
          <Skeleton style={{ height: 180 }} className="rounded-2xl" />
          <Skeleton style={{ height: 110 }} className="rounded-2xl" />
        </View>
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

  // Defensive: the API payload may omit name fields for some staff records;
  // never index into a possibly-undefined string (it crashes the whole tab layout).
  const fullName = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || p.email || 'Teacher';
  const initials = `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase()
    || (p.email?.[0] ?? 'T').toUpperCase();
  const desig = p.designationTitle ?? p.role ?? 'Teacher';
  let joined = p.joinDate ?? '—';
  if (p.joinDate) {
    try { joined = `${formatBs(adToBs(new Date(p.joinDate)), 'en')} BS`; } catch { /* keep raw */ }
  }

  const info: { k: string; v: string }[] = [
    { k: 'Employee ID', v: p.employeeId ?? '—' },
    { k: 'Department', v: p.departmentName ?? '—' },
    { k: 'Employment', v: p.employmentType ?? '—' },
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
        <ScreenHeader variant="hero" bare padTop={18} padBottom={20} align="center">
          {/* Settings gear — top-right of hero band (comp tProfile line 1061) */}
          <View style={styles.gearWrap}>
            <TouchableOpacity
              style={[styles.gearBtn, { backgroundColor: c.surface }]}
              accessibilityRole="button"
              accessibilityLabel="Profile details"
              activeOpacity={0.8}
              onPress={() => router.push('/(teacher)/profile-details')}
            >
              <Ionicons name="settings-outline" size={19} color={c.primary} />
            </TouchableOpacity>
          </View>

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
        </ScreenHeader>

        <View style={styles.body}>
          {/* Info rows */}
          <View style={[styles.card, CARD_SHADOW, { backgroundColor: c.surface }]}>
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
          <View style={[styles.card, CARD_SHADOW, { marginTop: 16, backgroundColor: c.surface }]}>
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
  card: { borderRadius: 16, paddingHorizontal: 16 },
  gearWrap: { position: 'absolute', top: 10, right: 16, zIndex: 1 },
  gearBtn: {
    width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#10231A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 2,
  },
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
