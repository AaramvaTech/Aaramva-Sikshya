import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, StatusBar, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { adToBs, formatBs } from 'bs-calendar';
import NpText from '../NpText';
import Skeleton from '../Skeleton';
import { ScreenHeader } from './ScreenHeader';
import { EmptyState, ErrorState } from './StateViews';
import { CARD_SHADOW } from './Card';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationInbox,
} from '../../hooks/useNotifications';
import { routeForPush } from '../../lib/notifications';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import type { NotificationItem } from '../../types';

/**
 * The notification inbox screen body (PUSH-1) — shared by all three role apps.
 * Rows mirror the backend `notifications` table; tapping marks read and routes
 * via the same data.route map a push tap uses.
 */

// Notification type → icon + accent (semantic, matches NoticeFeed's palette — not brand).
const TYPE_CONFIG: Record<string, { icon: keyof typeof Ionicons.glyphMap; tint: string; accent: string }> = {
  ATTENDANCE: { icon: 'calendar-number-outline', tint: '#FCE9E9', accent: '#E5484D' },
  FEE:        { icon: 'card-outline',            tint: '#FEF3E2', accent: '#D9892B' },
  EXAM:       { icon: 'ribbon-outline',          tint: '#EAF0FE', accent: '#5B7FE0' },
  NOTICE:     { icon: 'megaphone-outline',       tint: '#E4F6F1', accent: '#0E9F77' },
};
const DEFAULT_TYPE = { icon: 'notifications-outline' as const, tint: '#E4F6F1', accent: '#0E9F77' };

function timeLabel(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = d.getHours();
    const mm = String(d.getMinutes()).padStart(2, '0');
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${formatBs(adToBs(d), 'en')} · ${h12}:${mm} ${hh < 12 ? 'AM' : 'PM'}`;
  } catch {
    return '';
  }
}

function InboxRow({
  item,
  onPress,
}: {
  item: NotificationItem;
  onPress: (item: NotificationItem) => void;
}) {
  const c = useThemeColors();
  const cfg = TYPE_CONFIG[item.type?.toUpperCase()] ?? DEFAULT_TYPE;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(item)}
      style={[styles.row, CARD_SHADOW, { backgroundColor: c.surface }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: cfg.tint }]}>
        <Ionicons name={cfg.icon} size={18} color={cfg.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.titleRow}>
          <NpText
            numberOfLines={1}
            style={[
              styles.title,
              { color: c.foreground },
              !item.isRead && { fontFamily: FONT.extrabold },
            ]}
          >
            {item.title}
          </NpText>
          {!item.isRead && <View style={[styles.unreadDot, { backgroundColor: c.primary }]} />}
        </View>
        <NpText numberOfLines={2} style={[styles.body, { color: c.mutedForeground }]}>
          {item.body}
        </NpText>
        <Text style={styles.time}>{timeLabel(item.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );
}

export function NotificationInbox({ role }: { role: 'STUDENT' | 'PARENT' | 'TEACHER' }) {
  const c = useThemeColors();
  const [refreshing, setRefreshing] = useState(false);
  const { data: items, isLoading, isError, refetch } = useNotificationInbox();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = items?.filter((n) => !n.isRead).length ?? 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const openItem = (item: NotificationItem) => {
    if (!item.isRead) markRead.mutate(item.id);
    router.push(routeForPush(role, item.data?.route));
  };

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        <ScreenHeader
          variant="plain"
          compact
          padTop={12}
          padBottom={16}
          title="Notifications"
          subtitle="Updates from your school"
          right={
            unreadCount > 0 ? (
              <TouchableOpacity
                onPress={() => markAllRead.mutate()}
                hitSlop={8}
                accessibilityLabel="Mark all as read"
              >
                <Text style={[styles.markAll, { color: c.primary }]}>Mark all read</Text>
              </TouchableOpacity>
            ) : undefined
          }
        />

        <View style={styles.bodyWrap}>
          {isLoading ? (
            <View style={{ gap: 11 }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} style={{ height: 84 }} className="rounded-2xl" />
              ))}
            </View>
          ) : isError ? (
            <View style={{ paddingTop: 40 }}>
              <ErrorState title="Couldn't load notifications" onRetry={() => refetch()} />
            </View>
          ) : !items || items.length === 0 ? (
            <View style={{ paddingTop: 40 }}>
              <EmptyState
                chip
                icon="notifications-off-outline"
                title="No notifications yet"
                subtitle="Absences, results, fees and notices will show up here."
              />
            </View>
          ) : (
            items.map((n) => <InboxRow key={n.id} item={n} onPress={openItem} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// Timestamp caption color — same documented decorative literal as NoticeFeed.
const DATE_COLOR = '#A6B4AC';

const styles = StyleSheet.create({
  root: { flex: 1 },
  bodyWrap: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  markAll: { fontFamily: FONT.bold, fontSize: 12 },
  row: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 16,
    padding: 14,
    marginBottom: 11,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontFamily: FONT.bold, fontSize: 13, flexShrink: 1 },
  unreadDot: { width: 7, height: 7, borderRadius: 3.5 },
  body: { fontFamily: FONT.regular, fontSize: 12, lineHeight: 17, marginTop: 3 },
  time: { fontFamily: FONT.semibold, fontSize: 10.5, color: DATE_COLOR, marginTop: 6 },
});
