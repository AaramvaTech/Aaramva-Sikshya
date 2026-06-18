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
import { useFonts } from 'expo-font';
import { NotoSansDevanagari_400Regular } from '@expo-google-fonts/noto-sans-devanagari';

export default function RootLayout() {
  useBootSession();
  const { status, user } = useAuthStore();
  const [fontsLoaded] = useFonts({ NotoSansDevanagari: NotoSansDevanagari_400Regular });

  useEffect(() => {
    // Wait until boot resolves AND the <Stack> navigator is mounted (fontsLoaded).
    // Navigating earlier queues the action into an unmounted navigator (the <Stack>
    // render is also gated on fontsLoaded), which then replays in a passive effect on
    // mount and loops focus/dispatch → "Maximum update depth exceeded" (seen on Android,
    // where fonts load async). This effect only runs on auth-state changes — never on
    // in-state navigation — so pushes like /help-code are left alone.
    if (status === 'booting' || !fontsLoaded) return;

    if (status === 'noSchool') {
      router.replace('/');
    } else if (status === 'unauthed') {
      router.replace('/login');
    } else if (status === 'authed') {
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
  }, [status, user?.role, fontsLoaded]);

  // The navigator must be rendered UNCONDITIONALLY — expo-router needs it mounted
  // to provide navigation context. Swapping it for a loading View leaves router
  // actions with no navigator to land in ("Couldn't find a navigation context").
  // Instead, keep <Stack> always mounted and cover it with the loader overlay
  // until boot + fonts are ready.
  const showLoader = status === 'booting' || !fontsLoaded;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ThemeSync />
        <Stack screenOptions={{ headerShown: false }} />
        {showLoader && (
          <View
            style={StyleSheet.absoluteFill}
            className="items-center justify-center bg-background"
          >
            <ActivityIndicator size="large" color="#065f46" />
            <Text className="text-muted-foreground mt-4 text-sm">Loading...</Text>
          </View>
        )}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
