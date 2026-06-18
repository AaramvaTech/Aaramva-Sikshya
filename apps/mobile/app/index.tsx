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
import { rawApi } from '../lib/api';
import { setSecureItem } from '../lib/secureStore';
import { useAuthStore } from '../store/auth';
import NpText from '../components/NpText';
import { useThemeColors, headerGradient, deriveOnPrimary } from '../lib/theme/colors';

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

export default function SchoolEntryScreen() {
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const { setSlug: storeSetSlug, setStatus } = useAuthStore();
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const onPrimary = deriveOnPrimary(c.primary);

  const handleSearch = async () => {
    const trimmed = slug.trim().toLowerCase();
    // Validate format before calling the API
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
    } catch {
      setError('We couldn\'t find that school code. Check it with your school.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!tenant) return;
    await setSecureItem('tenantSlug', tenant.slug);
    storeSetSlug(tenant.slug);
    setStatus('unauthed');
  };

  const isEmpty = slug.trim().length === 0;

  return (
    <KeyboardAvoidingView
      style={styles.flex1}
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
          {/* Brand icon chip */}
          <View style={styles.iconChip}>
            <Image
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              source={require('../assets/images/brand-icon.png')}
              style={{ width: 36, height: 36 }}
              tintColor="#FFFFFF"
              resizeMode="contain"
            />
          </View>

          {/* Wordmark */}
          <Image
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            source={require('../assets/images/logo.png')}
            style={{ width: 200, height: 52, marginTop: 16 }}
            resizeMode="contain"
            // tintColor: white — recolors dark-green line-art to white on the gradient header
            tintColor="#FFFFFF"
          />

          {/* Tagline */}
          {/* onPrimary.pale — documented accent exception: on-primary decorative tint */}
          <Text style={[styles.tagline, { color: onPrimary.pale }]}>
            Simple school management for every school in Nepal
          </Text>
        </LinearGradient>

        {/* ---------------------------------------------------------------- */}
        {/* Body                                                              */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.body} className="bg-background">
          <Text style={styles.heading} className="text-foreground">Find your school</Text>
          <Text style={styles.subtext} className="text-muted-foreground">
            Enter the school code provided by your institution.
          </Text>

          {/* Input */}
          <View
            style={styles.inputRow}
            className="bg-surface-muted border border-border rounded-xl"
          >
            <Ionicons name="school-outline" size={18} color={c.mutedForeground} />
            <TextInput
              style={styles.textInput}
              className="text-foreground"
              placeholder="e.g. motherland-school"
              placeholderTextColor={c.mutedForeground}
              value={slug}
              onChangeText={(t) => { setSlug(t); setError(null); setTenant(null); }}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            {slug.length > 0 && (
              <TouchableOpacity
                onPress={() => { setSlug(''); setError(null); setTenant(null); }}
                accessibilityLabel="Clear input"
              >
                <Ionicons name="close-circle" size={18} color={c.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>

          {/* Inline error */}
          {error !== null && (
            <View
              style={[
                styles.errorRow,
                // bg-danger/10: danger bg at 10% opacity — inline style because
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

          {/* Loading spinner */}
          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={c.primary} />
            </View>
          )}

          {/* Found school preview */}
          {tenant !== null && !loading && (
            <View
              style={styles.previewCard}
              className="bg-surface border border-border rounded-xl"
            >
              {/* Logo or brand-icon fallback */}
              {tenant.logoUrl !== null ? (
                <Image
                  source={{ uri: tenant.logoUrl }}
                  style={styles.schoolLogo}
                />
              ) : (
                <View style={styles.schoolLogoFallback} className="bg-surface-muted">
                  <Image
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    source={require('../assets/images/brand-icon.png')}
                    style={{ width: 28, height: 28 }}
                    tintColor={c.primary}
                    resizeMode="contain"
                  />
                </View>
              )}
              <View style={styles.previewInfo}>
                <NpText style={styles.schoolName} className="text-foreground">{tenant.name}</NpText>
                <Text style={styles.schoolSlug} className="text-primary">{tenant.slug}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={22} color={c.primary} />
            </View>
          )}

          {/* CTA */}
          {tenant === null ? (
            <TouchableOpacity
              style={[
                styles.ctaButton,
                (isEmpty || loading) && styles.ctaDisabled,
              ]}
              className="bg-primary rounded-xl"
              onPress={handleSearch}
              disabled={loading || isEmpty}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={c.primaryForeground} />
              ) : (
                <>
                  <Ionicons
                    name="search-outline"
                    size={16}
                    color={c.primaryForeground}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.ctaText} className="text-primary-foreground">Find school</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.ctaButton}
              className="bg-primary rounded-xl"
              onPress={handleConfirm}
              activeOpacity={0.85}
            >
              <Text style={[styles.ctaText, { marginRight: 8 }]} className="text-primary-foreground">
                Continue to login
              </Text>
              <Ionicons name="arrow-forward" size={18} color={c.primaryForeground} />
            </TouchableOpacity>
          )}

          {/* "Don't know your code?" helper */}
          <TouchableOpacity
            style={styles.helpLink}
            onPress={() => router.push('/help-code')}
            activeOpacity={0.7}
          >
            <Ionicons name="help-circle-outline" size={15} color={c.mutedForeground} style={{ marginRight: 5 }} />
            <Text style={styles.helpText} className="text-muted-foreground">
              Don't know your code?
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
          <Ionicons name="lock-closed" size={12} color={c.mutedForeground} style={{ marginRight: 5 }} />
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
  iconChip: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagline: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
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
    marginBottom: 4,
  },
  subtext: {
    fontSize: 14,
    marginBottom: 20,
    lineHeight: 20,
  },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  textInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: 10,
    fontSize: 15,
  },

  // Error
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
  },

  loadingRow: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 8,
  },

  // Found-school preview card
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 14,
    borderRadius: 12,
  },
  schoolLogo: {
    width: 44,
    height: 44,
    borderRadius: 10,
    marginRight: 12,
  },
  schoolLogoFallback: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  previewInfo: {
    flex: 1,
  },
  schoolName: {
    fontSize: 15,
    fontWeight: '600',
  },
  schoolSlug: {
    fontSize: 12,
    marginTop: 2,
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
    opacity: 0.5,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Help link
  helpLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginBottom: 8,
  },
  helpText: {
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
