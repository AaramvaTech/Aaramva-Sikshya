import { View, Text, Image, ScrollView, TouchableOpacity, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useMyProfile } from '../../hooks/useStudentMe';
import { useFileUrl } from '../../hooks/useFileUrl';
import NpText from '../../components/NpText';
import Skeleton from '../../components/Skeleton';
import { ErrorState, ScreenHeader , LanguageToggle } from '../../components/ui';
import { useLocale } from '../../hooks/useLocale';
import { CARD_SHADOW } from '../../components/ui/Card';
import { useAuthStore } from '../../store/auth';
import { useBranding } from '../../lib/theme/provider';
import { logout } from '../../lib/session';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

const SETTINGS: { icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; label: string; key: string }[] = [
  { icon: 'notifications-outline', label: 'Notifications', key: 'settingsRow.notifications' },
  { icon: 'lock-closed-outline', label: 'Privacy & security', key: 'settingsRow.privacy' },
  { icon: 'help-circle-outline', label: 'Help & support', key: 'settingsRow.help' },
];

export default function StudentProfile() {
  const c = useThemeColors();
  const { t } = useLocale('student');
  const tenant = useAuthStore((s) => s.tenant);
  const { branding } = useBranding();
  const { data: p, isLoading, isError, refetch } = useMyProfile();
  // FILE-1: storage-key photos resolve to presigned GETs; legacy values pass through.
  const photoSrc = useFileUrl(p?.photoUrl);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const schoolName = branding?.name ?? tenant?.name ?? 'Aaramva Shikshya';

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <Skeleton style={{ height: 240 }} className="rounded-none" />
        <View style={{ paddingHorizontal: 16, marginTop: 16, gap: 12 }}>
          <Skeleton style={{ height: 180 }} className="rounded-2xl" />
        </View>
      </View>
    );
  }

  if (isError || !p) {
    return (
      <View style={[styles.root, { backgroundColor: c.background, justifyContent: 'center' }]}>
        <ErrorState title={t('profile.errorTitle')} onRetry={() => refetch()} />
      </View>
    );
  }

  const fullName = `${p.firstName} ${p.lastName}`;
  const initials = `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase();
  const e = p.currentEnrollment;
  const sub = e ? `${p.admissionNumber} · ${e.className} ${e.sectionName}` : p.admissionNumber;

  const info: { k: string; v: string }[] = [
    { k: 'Admission no.', v: p.admissionNumber },
    { k: 'Class / Section', v: e ? `${e.className} · ${e.sectionName}` : '—' },
    { k: 'Roll number', v: e?.rollNumber != null ? String(e.rollNumber) : '—' },
    { k: 'Academic year', v: e?.academicYearName ?? '—' },
  ];

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {/* Hero band */}
        <ScreenHeader variant="hero" bare padTop={18} padBottom={20} align="center">
          {/* Settings gear — top-right of hero band (comp sProfile line 408).
              Navigates to the read-only profile-details screen. */}
          <View style={styles.gearWrap}>
            <TouchableOpacity
              style={[styles.gearBtn, { backgroundColor: c.surface }]}
              onPress={() => router.push('/(student)/profile-details')}
              accessibilityRole="button"
              accessibilityLabel="View profile details"
              activeOpacity={0.8}
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

          {photoSrc ? (
            <Image source={{ uri: photoSrc }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: c.primary }]}>
              <Text style={[styles.avatarText, { color: c.primaryForeground }]}>{initials}</Text>
            </View>
          )}
          <NpText style={[styles.name, { color: c.foreground }]}>{fullName}</NpText>
          <Text style={[styles.sub, { color: c.mutedForeground }]}>{sub}</Text>
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
                <NpText style={[styles.infoVal, { color: c.foreground }]}>{r.v}</NpText>
              </View>
            ))}
          </View>

          {/* Settings rows */}
          <View style={[styles.card, CARD_SHADOW, { backgroundColor: c.surface, marginTop: 16 }]}>
            {SETTINGS.map((s, idx) => (
              <View
                key={s.label}
                style={[styles.settingRow, idx < SETTINGS.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}
              >
                <Ionicons name={s.icon} size={20} color={c.primary} />
                <NpText style={[styles.settingLabel, { color: c.foreground }]}>{t(s.key)}</NpText>
                <Ionicons name="chevron-forward" size={18} color={c.border} />
              </View>
            ))}
          </View>

          {/* I18N-1: language selector */}
          <View style={{ marginTop: 16 }}>
            <NpText style={[styles.langLabel, { color: c.mutedForeground }]}>{t('common:settings.language')}</NpText>
            <LanguageToggle />
          </View>

          {/* Sign out */}
          <TouchableOpacity
            style={[styles.signOut, { backgroundColor: `${c.danger}14`, borderColor: `${c.danger}40` }]}
            onPress={() => { void logout(); }}
            activeOpacity={0.85}
          >
            <Ionicons name="log-out-outline" size={19} color={c.danger} style={{ marginRight: 8 }} />
            <NpText style={[styles.signOutText, { color: c.danger }]}>{t('common:action.signOut')}</NpText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  langLabel: { fontFamily: FONT.bold, fontSize: 12, marginBottom: 8 },
  root: { flex: 1 },

  // Gear button positioned absolutely in the top-right of the hero band (comp sProfile line 408).
  gearWrap: { position: 'absolute', top: 10, right: 16, zIndex: 1 },
  gearBtn: {
    width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#10231A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 2,
  },
  schoolRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
  schoolChip: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  schoolChipText: { fontFamily: FONT.extrabold, fontSize: 10 },
  schoolName: { fontFamily: FONT.bold, fontSize: 12 },
  avatar: { width: 78, height: 78, borderRadius: 39 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: FONT.extrabold, fontSize: 27 },
  name: { fontFamily: FONT.extrabold, fontSize: 19, marginTop: 12 },
  sub: { fontFamily: FONT.regular, fontSize: 12, marginTop: 3 },

  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  card: { borderRadius: 16, paddingHorizontal: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13 },
  infoKey: { fontFamily: FONT.regular, fontSize: 12.5 },
  infoVal: { fontFamily: FONT.bold, fontSize: 12.5 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  settingLabel: { fontFamily: FONT.semibold, fontSize: 13, flex: 1 },
  signOut: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 48, marginTop: 16, borderRadius: 14, borderWidth: 1.5,
  },
  signOutText: { fontFamily: FONT.bold, fontSize: 14 },
});
