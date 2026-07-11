import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import type { Href } from 'expo-router';
import api from './api';

/**
 * PUSH-1 mobile receive side. Everything here is DORMANT-READY: expo-notifications
 * throws at module init time in Expo Go (SDK 53+), so it is only ever loaded via
 * guarded dynamic import. Receiving a real push additionally needs a development
 * build + EXPO_PUBLIC_PROJECT_ID (EAS session — see .env); until then every entry
 * point below no-ops gracefully.
 */

export function isPushSupported(): boolean {
  return Device.isDevice && Constants.executionEnvironment !== 'storeClient';
}

/**
 * Request permission and register this device's Expo push token with the API.
 * Called fire-and-forget after login. Graceful on denial / missing project id.
 */
export async function registerPushToken(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const Notifications = await import('expo-notifications');
    if (Platform.OS === 'android') {
      // Android 13+ shows the permission prompt only after a channel exists.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'General',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
    if (!projectId) return; // set when the EAS project exists (EAS/FCM session)
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.post('/communication/devices', {
      token: tokenData.data,
      platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
      deviceName: Device.modelName ?? undefined,
    });
  } catch {
    // silently skip — push registration must never block login
  }
}

/**
 * Current device token WITHOUT prompting (permission is only read, not
 * requested) — used by logout to tell the API to drop this device's token.
 */
export async function getPushTokenSafe(): Promise<string | null> {
  if (!isPushSupported()) return null;
  try {
    const Notifications = await import('expo-notifications');
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;
    const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
    if (!projectId) return null;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch {
    return null;
  }
}

/** Payload the backend puts in every push's `data` (see PushService). */
export interface PushTapData {
  route?: string;
  notificationId?: string | null;
  [key: string]: unknown;
}

/** Map a backend route key onto the tapping user's role-scoped screen. */
export function routeForPush(role: string, route: string | undefined): Href {
  const r = (route ?? '').toLowerCase();
  if (role === 'STUDENT') {
    if (r === 'attendance') return '/(student)/attendance';
    if (r === 'results') return '/(student)/results';
    if (r === 'notices') return '/(student)/notices';
    return '/(student)';
  }
  if (role === 'PARENT') {
    if (r === 'attendance') return '/(parent)/attendance';
    if (r === 'results') return '/(parent)/results';
    if (r === 'fees') return '/(parent)/fees';
    if (r === 'notices') return '/(parent)/notices';
    return '/(parent)';
  }
  if (role === 'TEACHER') {
    if (r === 'attendance') return '/(teacher)/attendance';
    if (r === 'notices') return '/(teacher)/notices';
    return '/(teacher)';
  }
  return '/web-portal';
}

// Cold-start taps replay from getLastNotificationResponseAsync on every setup
// call (e.g. session switch re-runs the effect) — remember what we handled.
let lastHandledResponseId: string | null = null;

/**
 * Install the foreground-display handler + received/tap listeners.
 * Returns a cleanup fn, or null when push is unsupported (Expo Go / simulator).
 */
export async function setupPushHandlers(opts: {
  onReceived: () => void;
  onTap: (data: PushTapData) => void;
}): Promise<(() => void) | null> {
  if (!isPushSupported()) return null;
  try {
    const Notifications = await import('expo-notifications');

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });

    const received = Notifications.addNotificationReceivedListener(() => opts.onReceived());
    const response = Notifications.addNotificationResponseReceivedListener((resp) => {
      lastHandledResponseId = resp.notification.request.identifier;
      opts.onTap((resp.notification.request.content.data ?? {}) as PushTapData);
    });

    // App launched (cold start) by tapping a push.
    const last = await Notifications.getLastNotificationResponseAsync();
    if (last && last.notification.request.identifier !== lastHandledResponseId) {
      lastHandledResponseId = last.notification.request.identifier;
      opts.onTap((last.notification.request.content.data ?? {}) as PushTapData);
    }

    return () => {
      received.remove();
      response.remove();
    };
  } catch {
    return null;
  }
}
