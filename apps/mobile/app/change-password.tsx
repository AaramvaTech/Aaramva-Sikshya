import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ScrollView,
  Alert,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../lib/api';
import { logout } from '../lib/session';
import { useAuthStore } from '../store/auth';
import { useThemeColors, headerGradient } from '../lib/theme/colors';
import { FONT } from '../lib/theme/fonts';

const MIN_LENGTH = 8;

/**
 * POL-2 T6 — forced first-login password change (mirrors POL-1's web
 * /change-password). The root layout routes a temp-password session here and
 * holds it until the flag clears. Changing the password revokes every refresh
 * token server-side, so on success we sign out cleanly and send the user back to
 * login to re-enter with their new password. "Sign out instead" is always
 * available — the flag never traps the user.
 */
export default function ChangePasswordScreen() {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ramp = headerGradient(c.primary);
  const buttonGradient: [string, string] = [ramp[1], ramp[2]];

  const submit = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required.');
      return;
    }
    if (newPassword.length < MIN_LENGTH) {
      setError(`New password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      // Server cleared must_change_password AND revoked all refresh tokens; sign
      // out locally and route back to login for a clean re-entry.
      Alert.alert('Password changed', 'Please sign in with your new password.');
      await logout();
    } catch (err: unknown) {
      let msg = 'Could not change password. Please try again.';
      if (err instanceof Error) {
        msg = err.message.includes(': ') ? err.message.split(': ').slice(1).join(': ') : err.message;
      }
      setError(msg);
      setLoading(false);
    }
  };

  const signOut = async () => {
    await logout();
  };

  // Inlined below (not a nested component) so the TextInputs keep focus between
  // keystrokes — a component re-created each render would remount and drop focus.
  const inputRow = (
    value: string,
    onChangeText: (v: string) => void,
    placeholder: string,
  ) => (
    <View style={[styles.inputRow, { backgroundColor: c.brandField, borderColor: c.brandFieldBorder }]}>
      <Ionicons name="lock-closed-outline" size={18} color={c.brandMuted} />
      <TextInput
        style={[styles.textInput, { color: c.foreground }]}
        placeholder={placeholder}
        placeholderTextColor={c.mutedForeground}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );

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
        <View style={[styles.band, { paddingTop: insets.top + 26, backgroundColor: c.brandSurface, borderBottomColor: c.brandBorder }]}>
          <View style={[styles.iconChip, { backgroundColor: c.primary, shadowColor: c.primary }]}>
            <Ionicons name="key" size={26} color={c.primaryForeground} />
          </View>
          <Text style={[styles.title, { color: c.foreground }]}>Set your password</Text>
          <Text style={[styles.bandSub, { color: c.brandMuted }]}>
            You signed in with a temporary password
          </Text>
        </View>

        <View style={styles.body}>
          <View style={[styles.notice, { backgroundColor: `${c.primary}12`, borderColor: c.brandBorder }]}>
            <Ionicons name="information-circle-outline" size={16} color={c.primary} style={{ marginTop: 1 }} />
            <Text style={[styles.noticeText, { color: c.foreground }]}>
              Choose your own password to continue. The rest of the app stays locked until you do.
            </Text>
          </View>

          {!!user?.email && (
            <Text style={[styles.account, { color: c.mutedForeground }]}>Signed in as {user.email}</Text>
          )}

          <Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>Current (temporary) password</Text>
          {inputRow(currentPassword, setCurrentPassword, 'Temporary password')}
          <Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>New password</Text>
          {inputRow(newPassword, setNewPassword, `At least ${MIN_LENGTH} characters`)}
          <Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>Repeat new password</Text>
          {inputRow(confirmPassword, setConfirmPassword, 'Repeat new password')}

          <TouchableOpacity onPress={() => setShow((v) => !v)} style={styles.showToggle} activeOpacity={0.7}>
            <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={16} color={c.brandMuted} />
            <Text style={[styles.showToggleText, { color: c.brandMuted }]}>{show ? 'Hide' : 'Show'} passwords</Text>
          </TouchableOpacity>

          {error !== null && (
            <View style={[styles.errorRow, { backgroundColor: `${c.danger}1A`, borderColor: c.danger }]}>
              <Ionicons name="alert-circle-outline" size={16} color={c.danger} style={{ marginTop: 1 }} />
              <Text style={[styles.errorText, { color: c.danger }]}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.cta, { shadowColor: c.primary }, loading && styles.ctaDisabled]}
            onPress={submit}
            disabled={loading}
            activeOpacity={0.9}
          >
            <LinearGradient colors={buttonGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ctaFill}>
              {loading ? (
                <ActivityIndicator color={c.primaryForeground} />
              ) : (
                <Text style={[styles.ctaText, { color: c.primaryForeground }]}>Change password</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.signOut} onPress={signOut} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={17} color={c.danger} style={{ marginRight: 6 }} />
            <Text style={[styles.signOutText, { color: c.danger }]}>Sign out instead</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  band: { paddingHorizontal: 26, paddingBottom: 28, alignItems: 'center', borderBottomWidth: 1 },
  iconChip: {
    width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 5,
  },
  title: { fontFamily: FONT.extrabold, fontSize: 18, textAlign: 'center', marginTop: 14 },
  bandSub: { fontFamily: FONT.semibold, fontSize: 12.5, marginTop: 5, textAlign: 'center' },

  body: { flex: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24 },
  notice: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 16,
  },
  noticeText: { fontFamily: FONT.medium, fontSize: 12.5, flex: 1, lineHeight: 18 },
  account: { fontFamily: FONT.medium, fontSize: 12, marginBottom: 14 },

  fieldLabel: { fontFamily: FONT.bold, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 7, marginLeft: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'center', height: 50, paddingHorizontal: 14, marginBottom: 16, borderWidth: 1.5, borderRadius: 14 },
  textInput: { flex: 1, height: 50, paddingHorizontal: 10, fontFamily: FONT.medium, fontSize: 14 },

  showToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  showToggleText: { fontFamily: FONT.semibold, fontSize: 12.5 },

  errorRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16, borderWidth: 1, borderRadius: 12 },
  errorText: { fontFamily: FONT.medium, fontSize: 13, marginLeft: 8, flex: 1, lineHeight: 18 },

  cta: { borderRadius: 14, overflow: 'hidden', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 14, elevation: 5 },
  ctaFill: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { fontFamily: FONT.bold, fontSize: 15 },

  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 44, marginTop: 14 },
  signOutText: { fontFamily: FONT.bold, fontSize: 13.5 },
});
