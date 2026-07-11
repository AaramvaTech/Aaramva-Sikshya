/**
 * Jest-only stand-in for `expo-server-sdk` (v6+ is ESM-only, which jest's CJS
 * transform cannot parse — the real package loads fine at runtime via Node 24
 * require(esm)). Wired via `moduleNameMapper` in apps/api package.json.
 *
 * Unit tests replace the PushService instance's expo client with per-test
 * mocks; only the STATIC token validator and chunking need faithful semantics
 * here. `isExpoPushToken` is copied verbatim from the installed build
 * (node_modules/expo-server-sdk/build/ExpoClient.js). The real network client
 * is exercised end-to-end by the PUSH-1 live prune proof, not by unit tests.
 */

const PUSH_CHUNK_LIMIT = 100;
const RECEIPT_ID_CHUNK_LIMIT = 300;

export class Expo {
  static pushNotificationChunkSizeLimit = PUSH_CHUNK_LIMIT;
  static pushNotificationReceiptChunkSizeLimit = RECEIPT_ID_CHUNK_LIMIT;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_options: Record<string, unknown> = {}) {}

  static isExpoPushToken(token: unknown): boolean {
    return (
      typeof token === 'string' &&
      (((token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[')) &&
        token.endsWith(']')) ||
        /^[a-z\d]{8}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{12}$/i.test(token))
    );
  }

  chunkPushNotifications<T>(messages: T[]): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < messages.length; i += PUSH_CHUNK_LIMIT) {
      chunks.push(messages.slice(i, i + PUSH_CHUNK_LIMIT));
    }
    return chunks;
  }

  chunkPushNotificationReceiptIds(ids: string[]): string[][] {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += RECEIPT_ID_CHUNK_LIMIT) {
      chunks.push(ids.slice(i, i + RECEIPT_ID_CHUNK_LIMIT));
    }
    return chunks;
  }

  async sendPushNotificationsAsync(): Promise<never> {
    throw new Error('expo-server-sdk jest double: mock sendPushNotificationsAsync in the test');
  }

  async getPushNotificationReceiptsAsync(): Promise<never> {
    throw new Error('expo-server-sdk jest double: mock getPushNotificationReceiptsAsync in the test');
  }
}

// Type-only exports used by push.service.ts imports (erased at runtime, but the
// names must exist for TS when this file is type-checked as the module).
export type ExpoPushMessage = {
  to: string | string[];
  sound?: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
};
export type ExpoPushTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string; details?: { error?: string } };

export default Expo;
