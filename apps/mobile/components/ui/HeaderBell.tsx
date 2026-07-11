import { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useUnreadCount } from '../../hooks/useNotifications';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

/**
 * The dashboard notification bell (PUSH-1): live unread count from the API
 * (replaces the old hardcoded red dot), refetched on screen focus; a received
 * push invalidates the query via PushBootstrap. Tap → the role's inbox screen.
 */
export function HeaderBell({ inboxRoute }: { inboxRoute: Href }) {
  const c = useThemeColors();
  const { data: unread = 0, refetch } = useUnreadCount();

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  return (
    <TouchableOpacity
      onPress={() => router.push(inboxRoute)}
      hitSlop={10}
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      style={styles.wrap}
    >
      <Ionicons name="notifications-outline" size={22} color={c.primary} />
      {unread > 0 && (
        <View style={[styles.badge, { backgroundColor: c.danger, borderColor: c.brandSurface }]}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  badge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: FONT.extrabold, fontSize: 8.5, color: '#FFFFFF' },
});
