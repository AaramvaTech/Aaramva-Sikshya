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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../lib/api';
import { persistLoginSession } from '../lib/session';
import { registerPushToken } from '../lib/notifications';
import { deleteSecureItem } from '../lib/secureStore';
import { useAuthStore } from '../store/auth';
import NpText from '../components/NpText';
import { LanguageToggle } from '../components/ui';
import { useThemeColors, headerGradient } from '../lib/theme/colors';
import { useBranding } from '../lib/theme/provider';
import { FONT } from '../lib/theme/fonts';

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string; mustChangePassword?: boolean };
  tenant: { name: string; slug: string; logoUrl: string | null };
};

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { slug, setSession, clearSlug, setStatus } = useAuthStore();
  const { branding } = useBranding();
  const insets = useSafeAreaInsets();
  const c = useThemeColors();

  const schoolName = branding?.name ?? slug ?? 'Aaramva Shikshya';
  // Design's Sign-In button darkens left→right; reuse the derived ramp's mid+dark stops.
  const ramp = headerGradient(c.primary);
  const buttonGradient: [string, string] = [ramp[1], ramp[2]];

  const handleLogin = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.post<{ success: boolean; data: LoginResponse }>(
        '/auth/login',
        { email: trimmedEmail, password },
      );
      const { accessToken, refreshToken, user, tenant } = response.data.data;
      const effectiveSlug = slug ?? tenant.slug;
      await persistLoginSession({
        userId: user.id,
        userEmail: user.email,
        role: user.role,
        schoolSlug: effectiveSlug,
        schoolName: tenant.name,
        refreshToken,
      });
      setSession({
        accessToken,
        user,
        tenant,
        slug: effectiveSlug,
        // POL-2 T6: a temp-password login is routed to /change-password by the
        // root layout before any role app (mirrors POL-1's web enforcement).
        mustChangePassword: user.mustChangePassword === true,
      });
      void registerPushToken(); // fire-and-forget (lib/notifications, PUSH-1)
    } catch (err: unknown) {
      let msg = 'Login failed. Please try again.';
      if (err instanceof Error) {
        msg = err.message.includes(': ')
          ? err.message.split(': ').slice(1).join(': ')
          : err.message;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    await deleteSecureItem('tenantSlug');
    clearSlug();
    setStatus('noSchool');
  };

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
        {/* School brand band (light wash of the school's primary)           */}
        {/* ---------------------------------------------------------------- */}
        <View
          style={[
            styles.band,
            { paddingTop: insets.top + 26, backgroundColor: c.brandSurface, borderBottomColor: c.brandBorder },
          ]}
        >
          {branding?.logoUrl ? (
            <View style={[styles.logoChip, { backgroundColor: c.surface, shadowColor: c.primary }]}>
              <Image source={{ uri: branding.logoUrl }} style={{ width: 44, height: 44 }} resizeMode="contain" />
            </View>
          ) : (
            <View style={[styles.avatar, { backgroundColor: c.primary, shadowColor: c.primary }]}>
              <Text style={[styles.avatarText, { color: c.primaryForeground }]}>
                {initialsOf(schoolName)}
              </Text>
            </View>
          )}

          <NpText style={[styles.schoolName, { color: c.foreground }]}>{schoolName}</NpText>
          <Text style={[styles.bandSub, { color: c.brandMuted }]}>Sign in to your account</Text>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Body                                                              */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.body}>
          <Text style={[styles.heading, { color: c.foreground }]}>Welcome back</Text>

          {/* Email */}
          <Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>Email address</Text>
          <View style={[styles.inputRow, { backgroundColor: c.brandField, borderColor: c.brandFieldBorder }]}>
            <Ionicons name="mail-outline" size={18} color={c.brandMuted} />
            <TextInput
              style={[styles.textInput, { color: c.foreground }]}
              placeholder="you@school.edu.np"
              placeholderTextColor={c.mutedForeground}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          {/* Password */}
          <Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>Password</Text>
          <View style={[styles.inputRow, styles.inputRowLast, { backgroundColor: c.brandField, borderColor: c.brandFieldBorder }]}>
            <Ionicons name="lock-closed-outline" size={18} color={c.brandMuted} />
            <TextInput
              style={[styles.textInput, styles.textInputPassword, { color: c.foreground }]}
              placeholder="••••••••"
              placeholderTextColor={c.mutedForeground}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeToggle}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={c.brandMuted} />
            </TouchableOpacity>
          </View>

          {/* Error */}
          {error !== null && (
            <View style={[styles.errorRow, { backgroundColor: `${c.danger}1A`, borderColor: c.danger }]}>
              <Ionicons name="alert-circle-outline" size={16} color={c.danger} style={{ marginTop: 1 }} />
              <Text style={[styles.errorText, { color: c.danger }]}>{error}</Text>
            </View>
          )}

          {/* Sign In */}
          <TouchableOpacity
            style={[styles.cta, { shadowColor: c.primary }, loading && styles.ctaDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={buttonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaFill}
            >
              {loading ? (
                <ActivityIndicator color={c.primaryForeground} />
              ) : (
                <>
                  <Text style={[styles.ctaText, { color: c.primaryForeground, marginRight: 8 }]}>Sign In</Text>
                  <Ionicons name="arrow-forward" size={19} color={c.primaryForeground} />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Switch school */}
          <TouchableOpacity style={styles.switchLink} onPress={handleReset} activeOpacity={0.7}>
            <Text style={[styles.switchText, { color: c.brandMuted }]}>Switch school</Text>
          </TouchableOpacity>
        </View>

        {/* I18N-1: language toggle on the login screen — a parent who can't
            read English must be able to switch before signing in. */}
        <View style={styles.langRow}>
          <LanguageToggle compact />
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Trust footer                                                      */}
        {/* ---------------------------------------------------------------- */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Ionicons name="lock-closed" size={12} color={c.mutedForeground} style={{ marginRight: 5 }} />
          <Text style={[styles.footerText, { color: c.mutedForeground }]}>
            Private to your school. Secured by Aaramva Shikshya.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },

  // Brand band
  band: {
    paddingHorizontal: 26,
    paddingBottom: 28,
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  logoChip: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 4,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 5,
  },
  avatarText: { fontFamily: FONT.extrabold, fontSize: 23, letterSpacing: 0.5 },
  schoolName: { fontFamily: FONT.extrabold, fontSize: 17, textAlign: 'center', marginTop: 14 },
  bandSub: { fontFamily: FONT.semibold, fontSize: 12.5, marginTop: 5, textAlign: 'center' },

  // Body
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  heading: { fontFamily: FONT.extrabold, fontSize: 19, marginBottom: 18, letterSpacing: -0.3 },

  fieldLabel: {
    fontFamily: FONT.bold,
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 7,
    marginLeft: 1,
  },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1.5,
    borderRadius: 14,
  },
  inputRowLast: { marginBottom: 20 },
  textInput: {
    flex: 1,
    height: 50,
    paddingHorizontal: 10,
    fontFamily: FONT.medium,
    fontSize: 14,
  },
  textInputPassword: {
    fontFamily: FONT.semibold,
    fontSize: 15,
  },
  eyeToggle: { padding: 4 },

  // Error
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderRadius: 12,
  },
  errorText: { fontFamily: FONT.medium, fontSize: 13, marginLeft: 8, flex: 1, lineHeight: 18 },

  // CTA
  cta: {
    borderRadius: 14,
    overflow: 'hidden',
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
  ctaDisabled: { opacity: 0.6 },
  ctaText: { fontFamily: FONT.bold, fontSize: 15 },

  // Switch school
  switchLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    marginTop: 8,
  },
  switchText: { fontFamily: FONT.semibold, fontSize: 13.5 },

  // Footer
  langRow: { alignItems: 'center', marginTop: 20 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  footerText: { fontFamily: FONT.regular, fontSize: 11 },
});
