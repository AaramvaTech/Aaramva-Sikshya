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
  Image,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import api from '../lib/api';
import { persistLoginSession } from '../lib/session';
import { useAuthStore } from '../store/auth';

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

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor="#064e3b" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">

        {/* Brand header */}
        <View className="bg-emerald-900 pt-14 pb-12 px-6 items-center">
          {/* Full logo */}
          <Image
            source={require('../assets/images/logo.png')}
            style={{ width: 200, height: 52 }}
            resizeMode="contain"
          />
          {/* School name badge */}
          {slug ? (
            <View className="flex-row items-center bg-white/10 rounded-full px-4 py-1.5 mt-5">
              <Ionicons name="school-outline" size={13} color="#6ee7b7" />
              <Text className="text-emerald-200 text-sm font-medium ml-2">{slug}</Text>
            </View>
          ) : null}
          <Text className="text-emerald-400 text-sm mt-3">Sign in to your account</Text>
        </View>

        {/* Form */}
        <View className="flex-1 px-6 pt-8 pb-10">
          <Text className="text-gray-800 text-xl font-bold mb-6">Welcome back</Text>

          {/* Email */}
          <Text className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1.5 ml-1">
            Email Address
          </Text>
          <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-4 mb-4">
            <Ionicons name="mail-outline" size={18} color="#6b7280" />
            <TextInput
              className="flex-1 py-3.5 px-3 text-gray-800 text-base"
              placeholder="you@school.com"
              placeholderTextColor="#9ca3af"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          {/* Password */}
          <Text className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1.5 ml-1">
            Password
          </Text>
          <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-4 mb-5">
            <Ionicons name="lock-closed-outline" size={18} color="#6b7280" />
            <TextInput
              className="flex-1 py-3.5 px-3 text-gray-800 text-base"
              placeholder="••••••••"
              placeholderTextColor="#9ca3af"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} className="p-1">
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color="#9ca3af"
              />
            </TouchableOpacity>
          </View>

          {/* Error */}
          {error !== null && (
            <View className="flex-row items-start bg-red-50 border border-red-100 rounded-xl px-3 py-3 mb-5">
              <Ionicons name="alert-circle-outline" size={16} color="#ef4444" style={{ marginTop: 1 }} />
              <Text className="text-red-500 text-sm ml-2 flex-1">{error}</Text>
            </View>
          )}

          {/* Sign in button */}
          <TouchableOpacity
            className={`rounded-xl py-4 items-center flex-row justify-center ${loading ? 'bg-emerald-400' : 'bg-emerald-800'}`}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Text className="text-white font-semibold text-base mr-2">Sign In</Text>
                <Ionicons name="arrow-forward" size={18} color="white" />
              </>
            )}
          </TouchableOpacity>

          {/* Small brand icon at bottom */}
          <View className="items-center mt-10">
            <Image
              source={require('../assets/images/brand-icon.png')}
              style={{ width: 32, height: 32, opacity: 0.25 }}
              resizeMode="contain"
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
