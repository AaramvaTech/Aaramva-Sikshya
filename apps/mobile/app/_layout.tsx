import '../global.css';
import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';
import { useAuthStore } from '../store/auth';
import { useBootSession } from '../lib/session';
import { ThemeProvider } from '../lib/theme/provider';
import ThemeSync from '../components/ThemeSync';
import PushBootstrap from '../components/PushBootstrap';
import { useFonts } from 'expo-font';
import { APP_FONTS } from '../lib/theme/fonts';
import { useLocaleStore } from '../store/locale';

export default function RootLayout() {
  useBootSession();
  const { status, user, mustChangePassword } = useAuthStore();
  const [fontsLoaded] = useFonts(APP_FONTS);

  // I18N-1: load the persisted locale (or device default) + init i18next once,
  // before any UI copy renders.
  const localeReady = useLocaleStore((s) => s.ready);
  const hydrateLocale = useLocaleStore((s) => s.hydrate);
  useEffect(() => {
    void hydrateLocale();
  }, [hydrateLocale]);

  useEffect(() => {
    // Drive auth routing imperatively once boot + fonts resolve. We deliberately do
    // NOT read useRootNavigationState()/useNavigation() here — those touch React
    // Navigation's state context, which this component sits OUTSIDE of (it renders
    // the <Stack> navigator below), so calling them throws
    // "Couldn't find a navigation context" at startup.
    // router.replace() is safe to call before the navigator is registered: expo-router
    // enqueues the action (see global-state/routingQueue) and replays it the moment the
    // navigation container mounts. The <Stack> is rendered unconditionally for this reason.
    if (status === 'booting' || !fontsLoaded) return;

    if (status === 'noSchool') {
      router.replace('/');
    } else if (status === 'unauthed') {
      router.replace('/login');
    } else if (status === 'authed') {
      // POL-2 T6: a temp-password login is held on the change-password screen
      // until the flag clears — before any role app (mirrors POL-1's web shell).
      if (mustChangePassword) {
        router.replace('/change-password');
        return;
      }
      const role = user?.role;
      if (role === 'STUDENT') {
        router.replace('/(student)');
      } else if (role === 'PARENT') {
        router.replace('/(parent)');
      } else if (role === 'TEACHER') {
        router.replace('/(teacher)');
      } else {
        router.replace('/web-portal');
      }
    }
  }, [status, user?.role, mustChangePassword, fontsLoaded]);

  const showLoader = status === 'booting' || !fontsLoaded || !localeReady;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ThemeSync />
        <PushBootstrap />
        <Stack screenOptions={{ headerShown: false }} />
        {showLoader && (
          <View
            style={StyleSheet.absoluteFill}
            className="items-center justify-center bg-background"
          >
            <ActivityIndicator size="large" color="#0B6B43" />
            <Text className="text-muted-foreground mt-4 text-sm">Loading...</Text>
          </View>
        )}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
