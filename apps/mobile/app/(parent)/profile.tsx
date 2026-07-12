import { View, Text, Image, ScrollView, TouchableOpacity, StatusBar, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useMyChildren, useGuardianProfile } from '../../hooks/useParentChild';
import { useAuthStore } from '../../store/auth';
import { useBranding } from '../../lib/theme/provider';
import { logout } from '../../lib/session';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import { ErrorState, ScreenHeader } from '../../components/ui';
import { CARD_SHADOW } from '../../components/ui/Card';
import NpText from '../../components/NpText';
import Skeleton from '../../components/Skeleton';
import { guardianDisplayName, guardianInitials } from '../../lib/guardian';

export default function ParentProfile() {
  const c = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);
  const { branding } = useBranding();
  const childrenQuery = useMyChildren();
  const children = childrenQuery.data ?? [];
  const { data: guardian } = useGuardianProfile();

  const schoolName = branding?.name ?? tenant?.name ?? 'Aaramva Shikshya';
  const email = guardian?.email ?? user?.email ?? '';
  const guardianName = guardianDisplayName(guardian, email);
  const initials = guardianInitials(guardianName);
  const relation = guardian?.relation ?? children[0]?.relation ?? 'Guardian';

  const info: { k: string; v: string }[] = [
    { k: 'Relation', v: relation },
    ...(guardian?.phone ? [{ k: 'Phone', v: guardian.phone }] : []),
    { k: 'Email', v: email || '—' },
  ];

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero band */}
        <ScreenHeader variant="hero" bare padTop={18} padBottom={20} align="center">
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

          <View style={[styles.avatar, { backgroundColor: c.primary }]}>
            <Text style={[styles.avatarText, { color: c.primaryForeground }]}>{initials}</Text>
          </View>
          <Text style={[styles.name, { color: c.foreground }]}>{guardianName}</Text>
          <Text style={[styles.sub, { color: c.mutedForeground }]}>{relation}</Text>
        </ScreenHeader>

        <View style={styles.body}>
          {/* Guardian info */}
          <View style={[styles.card, CARD_SHADOW, { backgroundColor: c.surface }]}>
            {info.map((r, idx) => (
              <View
                key={r.k}
                style={[styles.infoRow, idx < info.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}
              >
                <Text style={[styles.infoKey, { color: c.mutedForeground }]}>{r.k}</Text>
                <Text style={[styles.infoVal, { color: c.foreground }]} numberOfLines={1}>{r.v}</Text>
              </View>
            ))}
          </View>

          {/* View details shortcut */}
          <TouchableOpacity
            style={[styles.detailsRow, CARD_SHADOW, { backgroundColor: c.surface }]}
            onPress={() => router.push('/(parent)/profile-details')}
            activeOpacity={0.8}
          >
            <Ionicons name="person-circle-outline" size={18} color={c.primary} />
            <Text style={[styles.detailsRowLabel, { color: c.foreground }]}>View profile details</Text>
            <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>

          {/* My children */}
          <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>My children</Text>
          {childrenQuery.isLoading ? (
            <View style={[styles.card, CARD_SHADOW, { backgroundColor: c.surface, paddingVertical: 14, gap: 10 }]}>
              {[0, 1].map((i) => <Skeleton key={i} style={{ height: 44 }} className="rounded-xl" />)}
            </View>
          ) : childrenQuery.isError ? (
            <View style={[styles.card, CARD_SHADOW, { backgroundColor: c.surface }]}>
              <ErrorState compact title="Couldn't load children" onRetry={() => void childrenQuery.refetch()} />
            </View>
          ) : (
            <View style={[styles.card, CARD_SHADOW, { backgroundColor: c.surface }]}>
              {children.map((ch, idx) => {
                const e = ch.currentEnrollment;
                const sub = e ? `Class ${e.className}${e.sectionName}${e.rollNumber != null ? ` · Roll ${e.rollNumber}` : ''}` : 'Not enrolled';
                const ci = `${ch.firstName[0] ?? ''}${ch.lastName[0] ?? ''}`.toUpperCase();
                return (
                  <View
                    key={ch.id}
                    style={[styles.childRow, idx < children.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}
                  >
                    <View style={[styles.childAvatar, { backgroundColor: c.brandSurface }]}>
                      <Text style={[styles.childInit, { color: c.primary }]}>{ci}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <NpText style={[styles.childName, { color: c.foreground }]}>{ch.firstName} {ch.lastName}</NpText>
                      <Text style={[styles.childSub, { color: c.mutedForeground }]}>{sub}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={c.border} />
                  </View>
                );
              })}
            </View>
          )}

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
  avatar: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: FONT.extrabold, fontSize: 26 },
  name: { fontFamily: FONT.extrabold, fontSize: 19, marginTop: 12 },
  sub: { fontFamily: FONT.regular, fontSize: 12, marginTop: 3 },

  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  card: { borderRadius: 16, paddingHorizontal: 16 },
  sectionLabel: { fontFamily: FONT.bold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 16, marginBottom: 10, marginLeft: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, gap: 12 },
  infoKey: { fontFamily: FONT.regular, fontSize: 12.5 },
  infoVal: { fontFamily: FONT.bold, fontSize: 12.5, flexShrink: 1, textAlign: 'right' },
  childRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  childAvatar: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  childInit: { fontFamily: FONT.extrabold, fontSize: 13 },
  childName: { fontFamily: FONT.bold, fontSize: 13 },
  childSub: { fontFamily: FONT.regular, fontSize: 11, marginTop: 1 },
  detailsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 48, marginTop: 10, borderRadius: 14, paddingHorizontal: 14,
  },
  detailsRowLabel: { fontFamily: FONT.bold, fontSize: 13 },
  signOut: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 48, marginTop: 16, borderRadius: 14, borderWidth: 1.5,
  },
  signOutText: { fontFamily: FONT.bold, fontSize: 14 },
});
