import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEYS = {
  refreshToken: 'refreshToken',
  tenantSlug: 'tenantSlug',
  msSessions: 'ms_sessions',
  msActive: 'ms_active',
} as const;

type SecureKey = keyof typeof KEYS;

// expo-secure-store is native-only. On web (dev preview) fall back to
// localStorage — acceptable because the mobile app is the real target.
export async function getSecureItem(key: SecureKey): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(KEYS[key]);
  return SecureStore.getItemAsync(KEYS[key]);
}

export async function setSecureItem(key: SecureKey, value: string): Promise<void> {
  if (Platform.OS === 'web') { localStorage.setItem(KEYS[key], value); return; }
  await SecureStore.setItemAsync(KEYS[key], value);
}

export async function deleteSecureItem(key: SecureKey): Promise<void> {
  if (Platform.OS === 'web') { localStorage.removeItem(KEYS[key]); return; }
  await SecureStore.deleteItemAsync(KEYS[key]);
}

// ─── Multi-session helpers ──────────────────────────────────────────────────

export interface PersistedSession {
  id: string;
  schoolSlug: string;
  schoolName: string;
  userId: string;
  userEmail: string;
  role: string;
  refreshToken: string;
}

export async function getMsSessions(): Promise<PersistedSession[]> {
  const json = await getSecureItem('msSessions');
  if (!json) return [];
  try {
    return JSON.parse(json) as PersistedSession[];
  } catch {
    return [];
  }
}

export async function saveMsSessions(sessions: PersistedSession[]): Promise<void> {
  await setSecureItem('msSessions', JSON.stringify(sessions));
}

export async function getMsActiveSessionId(): Promise<string | null> {
  return getSecureItem('msActive');
}

export async function saveMsActiveSessionId(id: string): Promise<void> {
  await setSecureItem('msActive', id);
}

export async function deleteMsActiveSessionId(): Promise<void> {
  await deleteSecureItem('msActive');
}

/** Upsert a session in the persisted list (called from login + session restore). */
export async function upsertPersistedSession(session: PersistedSession): Promise<void> {
  const existing = await getMsSessions();
  const updated = existing.some((s) => s.id === session.id)
    ? existing.map((s) => (s.id === session.id ? session : s))
    : [...existing, session];
  await saveMsSessions(updated);
}

/** Remove a session from the persisted list (called from logout). */
export async function removePersistedSession(sessionId: string): Promise<void> {
  const existing = await getMsSessions();
  await saveMsSessions(existing.filter((s) => s.id !== sessionId));
}
