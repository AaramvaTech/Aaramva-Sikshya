import '../global.css';
import { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Stack, router } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';
import { useAuthStore } from '../store/auth';
import { useBootSession } from '../lib/session';
import { ThemeProvider } from '../lib/theme/provider';

export default function RootLayout() {
  useBootSession();
  const { status, user } = useAuthStore();

  useEffect(() => {
    if (status === 'booting') return;

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
  }, [status, user?.role]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {status === 'booting' ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#1a8055" />
            <Text className="text-muted-foreground mt-4 text-sm">Loading...</Text>
          </View>
        ) : (
          <Stack screenOptions={{ headerShown: false }} />
        )}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
