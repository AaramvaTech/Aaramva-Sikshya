import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';
import { rawApi } from '../lib/api';
import { setSecureItem } from '../lib/secureStore';
import { useAuthStore } from '../store/auth';
import NpText from '../components/NpText';
import { FONT } from '../lib/theme/fonts';

// Aaramva onboarding brand surface. These are the exact design literals for the
// pre-school (Aaramva-branded) onboarding flow — a documented exception to the
// "tokens only" rule, like the calendar Saturday highlight. Per-school screens
// (post-login) use the theme tokens instead.
const OB = {
  green: '#0B6B43',
  greenDark: '#064E33',
  bandBg: '#E9F4EE',
  bandBorder: '#D5E8DD',
  fieldBg: '#F3F7F4',
  fieldBorder: '#DCE6DF',
  ink: '#10231A',
  body: '#6B7C74',
  muted: '#7A8B82',
  faint: '#94A49B',
  tagline: '#5E7A6B',
  cancel: '#A6B4AC',
  check: '#16A37C',
  cardBorder: '#E4E9E5',
  danger: '#E5484D',
};

type TenantInfo = {
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  primaryForeground: string | null;
};

// Validates that the code has no whitespace/uppercase and is non-empty
function isValidSlugFormat(value: string): boolean {
  return value.length > 0 && /^[a-z0-9-]+$/.test(value);
}

// First letters of up to two words, uppercased — e.g. "Gyan Jyoti …" -> "GJ".
function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export default function SchoolEntryScreen() {
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const { setSlug: storeSetSlug, setStatus } = useAuthStore();
  const insets = useSafeAreaInsets();

  const handleSearch = async () => {
    const trimmed = slug.trim().toLowerCase();
    if (!isValidSlugFormat(trimmed)) {
      setError('Enter a valid school code (letters, numbers, hyphens).');
      return;
    }
    setLoading(true);
    setError(null);
    setTenant(null);
    try {
      const res = await rawApi.get<{ success: boolean; data: TenantInfo }>(
        `/tenants/verify/${trimmed}`,
      );
      setTenant(res.data.data);
    } catch (err) {
      // Distinguish "school doesn't exist" from "can't reach the server" so the user
      // (and the dev log) get the real reason instead of a single catch-all message.
      if (axios.isAxiosError(err)) {
        if (err.response) {
          if (err.response.status === 404) {
            setError("We couldn't find that school code. Check it with your school.");
          } else if (err.response.status === 429) {
            setError('Too many attempts. Please wait a minute and try again.');
          } else {
            setError(`Server error (${err.response.status}). Please try again shortly.`);
          }
        } else {
          setError("Can't reach the server. Make sure the API is running and reachable.");
        }
        if (__DEV__) {
          console.log(
            `[tenant verify] "${trimmed}" failed →`,
            'status:', err.response?.status ?? 'NO RESPONSE (network)',
            '| message:', err.message,
            '| url:', `${err.config?.baseURL ?? ''}${err.config?.url ?? ''}`,
          );
        }
      } else {
        setError('Something went wrong. Please try again.');
        if (__DEV__) console.log('[tenant verify] non-axios error:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!tenant) return;
    await setSecureItem('tenantSlug', tenant.slug);
    storeSetSlug(tenant.slug);
    // Root layout's auth router picks this up and routes to /login.
    setStatus('unauthed');
  };

  const isEmpty = slug.trim().length === 0;
  const avatarBg = tenant?.primaryColor ?? OB.green;
  const avatarFg = tenant?.primaryForeground ?? '#FFFFFF';

  return (
    <KeyboardAvoidingView
      style={[styles.flex1, { backgroundColor: '#FFFFFF' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, backgroundColor: '#FFFFFF' }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ---------------------------------------------------------------- */}
        {/* Aaramva brand band                                                */}
        {/* ---------------------------------------------------------------- */}
        <View style={[styles.band, { paddingTop: insets.top + 26 }]}>
          <Image
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            source={require('../assets/images/aaramva-wordmark.png')}
            style={tenant ? styles.wordmarkSm : styles.wordmark}
            resizeMode="contain"
          />
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* STEP: code entry                                                  */}
        {/* ---------------------------------------------------------------- */}
        {tenant === null ? (
          <View style={styles.body}>
            <Text style={styles.heading}>Find your school</Text>
            <Text style={styles.subtext}>
              Enter the school code provided by your institution to continue.
            </Text>

            {/* Input */}
            <View style={styles.inputRow}>
              <Ionicons name="school" size={19} color={OB.green} />
              <TextInput
                style={styles.textInput}
                placeholder="e.g. motherland-school"
                placeholderTextColor={OB.muted}
                value={slug}
                onChangeText={(t) => { setSlug(t); setError(null); }}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
              />
              {slug.length > 0 && (
                <TouchableOpacity
                  onPress={() => { setSlug(''); setError(null); }}
                  accessibilityLabel="Clear input"
                >
                  <Ionicons name="close-circle" size={18} color={OB.cancel} />
                </TouchableOpacity>
              )}
            </View>

            {/* Inline error */}
            {error !== null && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle-outline" size={16} color={OB.danger} style={{ marginTop: 1 }} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Find school CTA */}
            <TouchableOpacity
              style={[styles.cta, styles.ctaShadow, (isEmpty || loading) && styles.ctaDisabled]}
              onPress={handleSearch}
              disabled={loading || isEmpty}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={[OB.green, OB.greenDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ctaFill}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="search" size={19} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.ctaText}>Find school</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Don't know your code? */}
            <TouchableOpacity
              style={styles.helpLink}
              onPress={() => router.push('/help-code')}
              activeOpacity={0.7}
            >
              <Ionicons name="help-circle-outline" size={16} color={OB.faint} style={{ marginRight: 6 }} />
              <Text style={styles.helpText}>Don&apos;t know your code?</Text>
            </TouchableOpacity>

            {/* Trust note */}
            <View style={[styles.trust, { marginTop: 'auto' }]}>
              <Ionicons name="lock-closed" size={18} color={OB.green} style={{ marginRight: 10 }} />
              <Text style={styles.trustText}>
                Private to your school. Secured by Aaramva Shikshya.
              </Text>
            </View>
          </View>
        ) : (
          /* ---------------------------------------------------------------- */
          /* STEP: school found                                               */
          /* ---------------------------------------------------------------- */
          <View style={styles.body}>
            <Text style={styles.confirmText}>
              Confirm this is the correct school. You&apos;ll then sign in under your
              school&apos;s branding.
            </Text>

            <View style={[styles.foundCard, styles.foundShadow]}>
              {tenant.logoUrl ? (
                <Image source={{ uri: tenant.logoUrl }} style={styles.foundLogo} />
              ) : (
                <View style={[styles.foundAvatar, { backgroundColor: avatarBg }]}>
                  <Text style={[styles.foundAvatarText, { color: avatarFg }]}>
                    {initialsOf(tenant.name)}
                  </Text>
                </View>
              )}
              <View style={styles.foundInfo}>
                <NpText style={styles.foundName}>{tenant.name}</NpText>
                <View style={styles.slugChip}>
                  <Ionicons name="pricetag" size={12} color={OB.green} style={{ marginRight: 4 }} />
                  <Text style={styles.slugChipText}>{tenant.slug}</Text>
                </View>
              </View>
              <Ionicons name="checkmark-circle" size={24} color={OB.check} />
            </View>

            {/* Continue to login */}
            <TouchableOpacity style={[styles.cta, styles.ctaShadow]} onPress={handleConfirm} activeOpacity={0.9}>
              <LinearGradient
                colors={[OB.green, OB.greenDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ctaFill}
              >
                <Text style={[styles.ctaText, { marginRight: 8 }]}>Continue to login</Text>
                <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.helpLink}
              onPress={() => { setTenant(null); setError(null); }}
              activeOpacity={0.7}
            >
              <Text style={styles.helpText}>Not your school?</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },

  // Brand band
  band: {
    paddingHorizontal: 26,
    paddingBottom: 32,
    alignItems: 'center',
    backgroundColor: OB.bandBg,
    borderBottomWidth: 1,
    borderBottomColor: OB.bandBorder,
  },
  mark: { width: 42, aspectRatio: 51 / 55 },
  wordmark: { width: 178, aspectRatio: 257 / 55, marginTop: 16 },
  wordmarkSm: { width: 158, aspectRatio: 257 / 55, marginTop: 16 },
  tagline: {
    fontFamily: FONT.medium,
    fontSize: 12,
    color: OB.tagline,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
  },
  foundEyebrow: {
    fontFamily: FONT.semibold,
    fontSize: 12,
    color: OB.tagline,
    marginTop: 10,
  },

  // Body
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 24,
  },
  heading: { fontFamily: FONT.extrabold, fontSize: 19, color: OB.ink, letterSpacing: -0.3 },
  subtext: { fontFamily: FONT.regular, fontSize: 13.5, color: OB.body, marginTop: 5, lineHeight: 20 },
  confirmText: { fontFamily: FONT.regular, fontSize: 13.5, color: OB.body, lineHeight: 20 },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    paddingHorizontal: 14,
    marginTop: 20,
    backgroundColor: OB.fieldBg,
    borderWidth: 1.5,
    borderColor: OB.fieldBorder,
    borderRadius: 14,
  },
  textInput: {
    flex: 1,
    height: 50,
    paddingHorizontal: 10,
    fontFamily: FONT.semibold,
    fontSize: 15,
    color: OB.ink,
  },

  // Error
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: OB.danger,
    borderRadius: 12,
  },
  errorText: { fontFamily: FONT.medium, fontSize: 13, color: OB.danger, marginLeft: 8, flex: 1, lineHeight: 18 },

  // CTA
  cta: { marginTop: 14, borderRadius: 14, overflow: 'hidden' },
  ctaShadow: {
    shadowColor: OB.green,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 5,
  },
  ctaFill: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { fontFamily: FONT.bold, fontSize: 15, color: '#FFFFFF' },

  // Help link
  helpLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  helpText: { fontFamily: FONT.semibold, fontSize: 13, color: OB.muted },

  // Trust note
  trust: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: OB.fieldBg,
    borderRadius: 14,
    marginTop: 2,
  },
  trustText: { fontFamily: FONT.regular, fontSize: 11.5, color: OB.body, flex: 1, lineHeight: 17 },

  // Found card
  foundCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    marginTop: 18,
    borderWidth: 1.5,
    borderColor: OB.cardBorder,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  foundShadow: {
    shadowColor: '#10231A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 3,
  },
  foundLogo: { width: 54, height: 54, borderRadius: 14, marginRight: 14 },
  foundAvatar: {
    width: 54,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  foundAvatarText: { fontFamily: FONT.extrabold, fontSize: 19, letterSpacing: 0.5 },
  foundInfo: { flex: 1, minWidth: 0 },
  foundName: { fontFamily: FONT.extrabold, fontSize: 15.5, color: OB.ink, lineHeight: 20 },
  slugChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 9,
    backgroundColor: OB.fieldBg,
    borderRadius: 7,
    marginTop: 7,
  },
  slugChipText: { fontFamily: FONT.bold, fontSize: 11, color: OB.green },
});
