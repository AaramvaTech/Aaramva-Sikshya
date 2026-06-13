import * as SecureStore from 'expo-secure-store';

const KEYS = {
  refreshToken: 'refreshToken',
  tenantSlug: 'tenantSlug',
} as const;

type SecureKey = keyof typeof KEYS;

export async function getSecureItem(key: SecureKey): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS[key]);
}

export async function setSecureItem(key: SecureKey, value: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS[key], value);
}

export async function deleteSecureItem(key: SecureKey): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS[key]);
}
