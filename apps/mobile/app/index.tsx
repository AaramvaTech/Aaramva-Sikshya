import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { rawApi } from '../lib/api';
import { setSecureItem } from '../lib/secureStore';
import { useAuthStore } from '../store/auth';

type TenantInfo = {
  name: string;
  slug: string;
  logoUrl: string | null;
};

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
      const response = await rawApi.get<{ success: boolean; data: TenantInfo }>(
        `/tenants/verify/${trimmed}`,
      );
      setTenant(response.data.data);
    } catch {
      setError('School not found. Please check your school code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!tenant) return;
    await setSecureItem('tenantSlug', tenant.slug);
    storeSetSlug(tenant.slug);
    setStatus('unauthed');
    router.replace('/login');
  };

  return (
    <View className="flex-1 bg-white px-6 justify-center">
      <Text className="text-2xl font-bold text-center mb-2">Aaramva Shikshya</Text>
      <Text className="text-gray-500 text-center mb-8">
        Enter your school code to continue
      </Text>

      <TextInput
        className="border border-gray-300 rounded-lg px-4 py-3 text-base mb-4"
        placeholder="School code (e.g. navodaya)"
        value={slug}
        onChangeText={(text) => {
          setSlug(text);
          setError(null);
          setTenant(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={handleSearch}
      />

      {error !== null && (
        <Text className="text-red-500 text-sm mb-4">{error}</Text>
      )}

      {loading && <ActivityIndicator className="mb-4" />}

      {tenant !== null && !loading && (
        <View className="border border-gray-200 rounded-lg p-4 mb-4 items-center">
          {tenant.logoUrl !== null && (
            <Image
              source={{ uri: tenant.logoUrl }}
              className="w-16 h-16 rounded-lg mb-2"
            />
          )}
          <Text className="text-lg font-semibold">{tenant.name}</Text>
          <Text className="text-gray-400 text-sm">{tenant.slug}</Text>
        </View>
      )}

      {tenant === null ? (
        <TouchableOpacity
          className="bg-indigo-600 rounded-lg py-3 items-center"
          onPress={handleSearch}
          disabled={loading || slug.trim().length === 0}
        >
          <Text className="text-white font-semibold text-base">Find School</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          className="bg-green-600 rounded-lg py-3 items-center"
          onPress={handleConfirm}
        >
          <Text className="text-white font-semibold text-base">Continue to Login</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
