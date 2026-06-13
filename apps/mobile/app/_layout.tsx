import { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Stack, router } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';
import { useAuthStore } from '../store/auth';
import { useBootSession } from '../lib/session';

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
        router.replace('/(student)/home');
      } else if (role === 'PARENT') {
        router.replace('/(parent)/home');
      } else if (role === 'TEACHER') {
        router.replace('/(teacher)/home');
      } else {
        router.replace('/web-portal');
      }
    }
  }, [status, user?.role]);

  if (status === 'booting') {
    return (
      <QueryClientProvider client={queryClient}>
        <View className="flex-1 bg-white items-center justify-center">
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text className="text-gray-400 mt-4 text-sm">Loading...</Text>
        </View>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
