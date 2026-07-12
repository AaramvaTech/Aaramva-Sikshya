import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// In-memory AsyncStorage mock so we can simulate a cold restart (a fresh store
// reading a previously persisted locale).
const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (k: string) => Promise.resolve(store[k] ?? null),
    setItem: (k: string, v: string) => {
      store[k] = v;
      return Promise.resolve();
    },
  },
}));

import { useLocaleStore } from '../../store/locale';

describe('locale persistence (survives a simulated restart)', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    // reset the store's ready flag between tests
    useLocaleStore.setState({ locale: 'en', ready: false });
  });

  it('persists the chosen locale to AsyncStorage', async () => {
    await useLocaleStore.getState().hydrate();
    await useLocaleStore.getState().setLocale('np');
    expect(store.appLocale).toBe('np');
  });

  it('a fresh store hydrates back to the persisted locale', async () => {
    // First "session": choose Nepali.
    await useLocaleStore.getState().hydrate();
    await useLocaleStore.getState().setLocale('np');

    // Simulate a cold restart: reset in-memory state, hydrate again.
    useLocaleStore.setState({ locale: 'en', ready: false });
    await useLocaleStore.getState().hydrate();

    expect(useLocaleStore.getState().locale).toBe('np');
  });

  it('ignores a corrupt persisted value and does not crash', async () => {
    store.appLocale = 'klingon';
    await useLocaleStore.getState().hydrate();
    // falls through to device default (en in the test env)
    expect(['en', 'np']).toContain(useLocaleStore.getState().locale);
  });
});
