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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { rawApi } from '../lib/api';
import { setSecureItem } from '../lib/secureStore';
import { useAuthStore } from '../store/auth';

type TenantInfo = { name: string; slug: string; logoUrl: string | null };

export default function SchoolEntryScreen() {
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const { setSlug: storeSetSlug, setStatus } = useAuthStore();

  const handleSearch = async () => {
    const trimmed = slug.trim().toLowerCase();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setTenant(null);
    try {
      const res = await rawApi.get<{ success: boolean; data: TenantInfo }>(
        `/tenants/verify/${trimmed}`,
      );
      setTenant(res.data.data);
    } catch {
      setError('School not found. Check your school code and try again.');
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

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor="#064e3b" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">

        {/* Brand header — deep green */}
        <View className="bg-emerald-900 pt-16 pb-12 px-6 items-center">
          {/* Full horizontal logo */}
          <Image
            source={require('../assets/images/logo.png')}
            style={{ width: 220, height: 56 }}
            resizeMode="contain"
          />
          <Text className="text-emerald-300 text-sm mt-3">
            Simple school management for every school in Nepal
          </Text>
        </View>

        {/* Form area */}
        <View className="flex-1 px-6 pt-8 pb-10">
          <Text className="text-gray-800 text-xl font-bold mb-1">Find your school</Text>
          <Text className="text-gray-400 text-sm mb-7">
            Enter the school code provided by your institution.
          </Text>

          {/* Input */}
          <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-4 mb-3">
            <Ionicons name="school-outline" size={18} color="#6b7280" />
            <TextInput
              className="flex-1 py-3.5 px-3 text-gray-800 text-base"
              placeholder="e.g. motherland-school"
              placeholderTextColor="#9ca3af"
              value={slug}
              onChangeText={(t) => { setSlug(t); setError(null); setTenant(null); }}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            {slug.length > 0 && (
              <TouchableOpacity onPress={() => { setSlug(''); setError(null); setTenant(null); }}>
                <Ionicons name="close-circle" size={18} color="#d1d5db" />
              </TouchableOpacity>
            )}
          </View>

          {/* Error */}
          {error !== null && (
            <View className="flex-row items-start bg-red-50 border border-red-100 rounded-xl px-3 py-3 mb-4">
              <Ionicons name="alert-circle-outline" size={16} color="#ef4444" style={{ marginTop: 1 }} />
              <Text className="text-red-500 text-sm ml-2 flex-1">{error}</Text>
            </View>
          )}

          {loading && (
            <View className="items-center py-4">
              <ActivityIndicator color="#065f46" />
            </View>
          )}

          {/* Found school */}
          {tenant !== null && !loading && (
            <View className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 flex-row items-center">
              {tenant.logoUrl !== null ? (
                <Image source={{ uri: tenant.logoUrl }} className="w-11 h-11 rounded-lg mr-3" />
              ) : (
                <View className="w-11 h-11 rounded-lg bg-emerald-100 items-center justify-center mr-3">
                  <Image
                    source={require('../assets/images/brand-icon.png')}
                    style={{ width: 28, height: 28 }}
                    resizeMode="contain"
                  />
                </View>
              )}
              <View className="flex-1">
                <Text className="text-gray-800 font-semibold">{tenant.name}</Text>
                <Text className="text-emerald-600 text-xs mt-0.5">{tenant.slug}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={22} color="#059669" />
            </View>
          )}

          {/* CTA */}
          {tenant === null ? (
            <TouchableOpacity
              className={`rounded-xl py-4 items-center flex-row justify-center ${slug.trim().length === 0 || loading ? 'bg-emerald-300' : 'bg-emerald-800'}`}
              onPress={handleSearch}
              disabled={loading || slug.trim().length === 0}
              activeOpacity={0.85}
            >
              <Ionicons name="search-outline" size={16} color="white" style={{ marginRight: 8 }} />
              <Text className="text-white font-semibold text-base">Find School</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              className="bg-emerald-700 rounded-xl py-4 items-center flex-row justify-center"
              onPress={handleConfirm}
              activeOpacity={0.85}
            >
              <Text className="text-white font-semibold text-base mr-2">Continue to Login</Text>
              <Ionicons name="arrow-forward" size={18} color="white" />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
