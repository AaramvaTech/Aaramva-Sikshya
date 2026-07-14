import { View, Text, Image, ScrollView, TouchableOpacity, StatusBar, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { useMyStaffProfile } from '../../hooks/useTeacher';
import { useFileUrl } from '../../hooks/useFileUrl';
import { useAuthStore } from '../../store/auth';
import { useBranding } from '../../lib/theme/provider';
import { logout } from '../../lib/session';
import { useThemeColors } from '../../lib/theme/colors';
import { useLocale } from '../../hooks/useLocale';
import { FONT } from '../../lib/theme/fonts';
import { ErrorState, ScreenHeader, LanguageToggle, Icon, SchoolBadge, type IconName } from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';
import NpText from '../../components/NpText';
import Skeleton from '../../components/Skeleton';
import { adToBs, formatBs } from 'bs-calendar';

export default function TeacherProfile() {
  const c = useThemeColors();
  const { t } = useLocale('teacher');
  const router = useRouter();
  const tenant = useAuthStore((s) => s.tenant);
  const { branding } = useBranding();
  const { data: p, isLoading, isError, refetch } = useMyStaffProfile();
  // FILE-1: storage-key photos resolve to presigned GETs; legacy values pass through.
  const photoSrc = useFileUrl(p?.photoUrl);

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
        <ErrorState title={t('profile.errorTitle')} onRetry={() => refetch()} />
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

  const actions: { icon: IconName; label: string; route: Href }[] = [
    { icon: 'how_to_reg', label: 'My attendance record', route: '/(teacher)/my-attendance' },
    { icon: 'event_note', label: 'Apply for leave', route: '/(teacher)/leave' },
    { icon: 'campaign', label: 'School notices', route: '/(teacher)/notices' },
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
              <Icon name="settings" size={19} color={c.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.schoolRow}>
            <SchoolBadge name={schoolName} logoUrl={branding?.logoUrl} size={26} />
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
                <Icon name={a.icon} size={20} color={c.primary} />
                <Text style={[styles.settingLabel, { color: c.foreground }]}>{a.label}</Text>
                <Icon name="chevron_right" size={18} color={c.border} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Change password — nav row, mirrors the student/parent profile treatment. */}
          <TouchableOpacity
            style={[styles.card, styles.settingRow, CARD_SHADOW, { marginTop: 12, backgroundColor: c.surface }]}
            onPress={() => router.push('/change-password')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('settingsRow.changePassword')}
          >
            <Icon name="lock" size={20} color={c.primary} />
            <NpText style={[styles.settingLabel, { color: c.foreground }]}>{t('settingsRow.changePassword')}</NpText>
            <Icon name="chevron_right" size={18} color={c.border} />
          </TouchableOpacity>

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
            <Icon name="logout" size={19} color={c.danger} style={{ marginRight: 8 }} />
            <NpText style={[styles.signOutText, { color: c.danger }]}>{t('common:action.signOut')}</NpText>
          </TouchableOpacity>

          {/* Version footer (mirrors the student/parent profile treatment). */}
          <NpText style={[styles.footer, { color: c.mutedForeground }]}>{t('profile.footer')}</NpText>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  langLabel: { fontFamily: FONT.bold, fontSize: 12, marginBottom: 8 },
  root: { flex: 1 },

  schoolRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
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
  footer: { fontFamily: FONT.regular, fontSize: 10.5, textAlign: 'center', marginTop: 14 },
});
