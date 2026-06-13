import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import api from '../lib/api';
import { setSecureItem } from '../lib/secureStore';
import { useAuthStore } from '../store/auth';

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string };
  tenant: { name: string; slug: string; logoUrl: string | null };
};

/**
 * Fire-and-forget push token registration.
 * Any failure is logged and swallowed — it must never block or affect login.
 */
async function registerPushToken(): Promise<void> {
  // Skip on simulators/emulators — push tokens are only available on real devices.
  if (!Device.isDevice) return;

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;

  // getExpoPushTokenAsync throws without a valid EAS projectId.
  // We use the env var with a placeholder fallback so the call is graceful
  // in Expo Go / dev builds where EAS is not yet configured.
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: process.env.EXPO_PUBLIC_PROJECT_ID ?? 'placeholder',
  });

  await api.post('/communication/devices', { token: tokenData.data });
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { slug, setSession } = useAuthStore();

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

      // Persist refresh token to SecureStore before navigating away.
      await setSecureItem('refreshToken', refreshToken);

      // Store session in Zustand memory. Use slug from auth store (set during
      // school-code entry) or fall back to the tenant slug returned by the API.
      setSession({ accessToken, user, tenant, slug: slug ?? tenant.slug });

      // Fire-and-forget — must not block login or surface errors to the user.
      registerPushToken().catch((err) =>
        console.warn('[push] token registration failed:', err),
      );

      // Navigation is handled by the root layout's useEffect, which watches
      // the auth status. Setting the session (above) transitions status to
      // 'authed', triggering a role-based redirect to (student)/(parent)/(teacher).
    } catch (err: unknown) {
      // Surface a human-readable message. The api interceptor turns non-2xx
      // responses into Error objects with the format "<CODE>: <message>".
      // Strip the code prefix for a cleaner UX.
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

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 px-6 justify-center">
        <Text className="text-2xl font-bold text-center mb-2">Sign In</Text>
        {slug ? (
          <Text className="text-gray-500 text-center mb-8">{slug}</Text>
        ) : null}

        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 text-base mb-4"
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          returnKeyType="next"
        />

        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 text-base mb-4"
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />

        {error ? (
          <Text className="text-red-500 text-sm mb-4">{error}</Text>
        ) : null}

        <TouchableOpacity
          className="bg-indigo-600 rounded-lg py-3 items-center"
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold text-base">Sign In</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
