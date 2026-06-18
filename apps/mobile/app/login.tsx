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
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import api from '../lib/api';
import { persistLoginSession } from '../lib/session';
import { deleteSecureItem } from '../lib/secureStore';
import { useAuthStore } from '../store/auth';
import NpText from '../components/NpText';
import { useThemeColors, headerGradient, deriveOnPrimary } from '../lib/theme/colors';
import { useBranding } from '../lib/theme/provider';

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string };
  tenant: { name: string; slug: string; logoUrl: string | null };
};

// Push tokens require a development build — expo-notifications throws at module
// init time in Expo Go (SDK 53+), so we must guard before importing.
async function registerPushToken(): Promise<void> {
  if (!Device.isDevice) return;
  if (Constants.executionEnvironment === 'storeClient') return;
  try {
    const Notifications = await import('expo-notifications');
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
    if (!projectId) return;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.post('/communication/devices', { token: tokenData.data });
  } catch {
    // silently skip
  }
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
  const onPrimary = deriveOnPrimary(c.primary);

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
      setSession({ accessToken, user, tenant, slug: effectiveSlug });
      registerPushToken();
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
      style={styles.flex1}
      className="bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ---------------------------------------------------------------- */}
        {/* Gradient header                                                   */}
        {/* ---------------------------------------------------------------- */}
        <LinearGradient
          colors={headerGradient(c.primary) as [string, string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 24 }]}
        >
          {/* School logo chip — light backing so it reads on ANY school color */}
          {branding?.logoUrl ? (
            <View style={styles.logoChip} className="bg-surface">
              <Image
                source={{ uri: branding.logoUrl }}
                style={{ width: 44, height: 44 }}
                resizeMode="contain"
              />
            </View>
          ) : (
            <View style={styles.iconChip}>
              <Image
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                source={require('../assets/images/brand-icon.png')}
                style={{ width: 36, height: 36, tintColor: '#FFFFFF' }}
                resizeMode="contain"
              />
            </View>
          )}

          {/* School name */}
          <NpText style={[styles.schoolName, { color: c.primaryForeground }]}>
            {branding?.name ?? slug ?? 'Aaramva Shikshya'}
          </NpText>

          {/* Subtitle */}
          <Text style={[styles.subtitle, { color: onPrimary.pale }]}>
            Sign in to your account
          </Text>
        </LinearGradient>

        {/* ---------------------------------------------------------------- */}
        {/* Body                                                              */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.body} className="bg-background">
          <Text style={styles.heading} className="text-foreground">Welcome back</Text>

          {/* Email label */}
          <Text style={styles.fieldLabel} className="text-muted-foreground">
            Email Address
          </Text>
          {/* Email input row */}
          <View
            style={styles.inputRow}
            className="bg-surface-muted border border-border rounded-xl"
          >
            <Ionicons name="mail-outline" size={18} color={c.mutedForeground} />
            <TextInput
              style={styles.textInput}
              className="text-foreground"
              placeholder="you@school.com"
              placeholderTextColor={c.mutedForeground}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          {/* Password label */}
          <Text style={styles.fieldLabel} className="text-muted-foreground">
            Password
          </Text>
          {/* Password input row */}
          <View
            style={[styles.inputRow, styles.inputRowLast]}
            className="bg-surface-muted border border-border rounded-xl"
          >
            <Ionicons name="lock-closed-outline" size={18} color={c.mutedForeground} />
            <TextInput
              style={styles.textInput}
              className="text-foreground"
              placeholder="••••••••"
              placeholderTextColor={c.mutedForeground}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeToggle}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={c.mutedForeground}
              />
            </TouchableOpacity>
          </View>

          {/* Error row */}
          {error !== null && (
            <View
              style={[
                styles.errorRow,
                // bg-danger/10: danger bg at 10% opacity — inline because
                // NativeWind v4 opacity-fraction utilities are not reliable for bg
                { backgroundColor: `${c.danger}1A` },
              ]}
              className="border border-danger rounded-xl"
            >
              <Ionicons
                name="alert-circle-outline"
                size={16}
                color={c.danger}
                style={{ marginTop: 1 }}
              />
              <Text style={styles.errorText} className="text-danger">{error}</Text>
            </View>
          )}

          {/* Sign In button */}
          <TouchableOpacity
            style={[styles.ctaButton, loading && styles.ctaDisabled]}
            className="bg-primary rounded-xl"
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={c.primaryForeground} />
            ) : (
              <>
                <Text style={styles.ctaText} className="text-primary-foreground">Sign In</Text>
                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color={c.primaryForeground}
                  style={{ marginLeft: 8 }}
                />
              </>
            )}
          </TouchableOpacity>

          {/* Not your school? reset affordance */}
          <TouchableOpacity
            style={styles.resetLink}
            onPress={handleReset}
            activeOpacity={0.7}
          >
            <Ionicons
              name="swap-horizontal-outline"
              size={15}
              color={c.mutedForeground}
              style={{ marginRight: 5 }}
            />
            <Text style={styles.resetText} className="text-muted-foreground">
              Not your school?
            </Text>
          </TouchableOpacity>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Trust footer                                                      */}
        {/* ---------------------------------------------------------------- */}
        <View
          style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}
          className="bg-background"
        >
          {/* Faded brand mark — no hardcoded color; low opacity lets asset read naturally */}
          <Image
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            source={require('../assets/images/brand-icon.png')}
            style={{ width: 14, height: 14, opacity: 0.2, marginRight: 6 }}
            resizeMode="contain"
          />
          <Ionicons name="lock-closed" size={12} color={c.mutedForeground} style={{ marginRight: 4 }} />
          <Text style={styles.footerText} className="text-muted-foreground">
            Private to your school. Secured by Aaramva Shikshya.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles — layout only; colors delegated to className tokens / c.* JS props
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },

  // Header
  header: {
    paddingBottom: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  // Light backing chip — reads on any school color; bg set via bg-surface className
  logoChip: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChip: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  schoolName: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 14,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 6,
    textAlign: 'center',
  },

  // Body
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 8,
  },
  heading: {
    fontSize: 19,
    fontWeight: '500',
    marginBottom: 20,
  },

  // Field label
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginLeft: 2,
  },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  inputRowLast: {
    marginBottom: 16,
  },
  textInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: 10,
    fontSize: 15,
  },
  eyeToggle: {
    padding: 4,
  },

  // Error
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
  },

  // CTA button
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 14,
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // "Not your school?" reset link
  resetLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginBottom: 8,
  },
  resetText: {
    fontSize: 13,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  footerText: {
    fontSize: 11,
  },
});
