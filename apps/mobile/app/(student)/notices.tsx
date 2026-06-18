import {
  View, Text, ScrollView, ActivityIndicator,
  TouchableOpacity, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { useNotices } from '../../hooks/useStudentMe';
import type { NoticeItem } from '../../types';
import NpText from '../../components/NpText';
import { adToBs, formatBs } from 'bs-calendar';
import { useThemeColors, headerGradient, ON_PRIMARY_ACCENTS } from '../../lib/theme/colors';

const TYPE_CONFIG: Record<string, { bg: string; text: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  GENERAL:     { bg: '#dbeafe', text: '#1d4ed8', icon: 'information-circle', label: 'General'     },
  EXAM:        { bg: '#ede9fe', text: '#5b21b6', icon: 'document-text',      label: 'Exam'        },
  HOLIDAY:     { bg: '#d1fae5', text: '#065f46', icon: 'sunny',              label: 'Holiday'     },
  FEE:         { bg: '#fef3c7', text: '#92400e', icon: 'card',               label: 'Fee'         },
  EVENT:       { bg: '#fce7f3', text: '#9d174d', icon: 'star',               label: 'Event'       },
  EMERGENCY:   { bg: '#fee2e2', text: '#dc2626', icon: 'alert-circle',       label: 'Emergency'   },
};

function typeConfig(type: string) {
  return TYPE_CONFIG[type?.toUpperCase()] ?? TYPE_CONFIG['GENERAL'];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const ad = new Date(dateStr);
  const bs = adToBs(ad);
  return formatBs(bs, 'en');
}

function NoticeCard({ notice }: { notice: NoticeItem }) {
  const [expanded, setExpanded] = useState(false);
  const c = useThemeColors();
  const cfg = typeConfig(notice.type);
  const date = notice.publishedAt ?? notice.createdAt;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setExpanded(!expanded)}
      style={{
        borderRadius: 20, marginBottom: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
        overflow: 'hidden',
      }}
      className="bg-surface"
    >
      {/* Top accent bar */}
      <View style={{ height: 4, backgroundColor: cfg.text }} />

      <View style={{ padding: 16 }}>
        {/* Header row */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
          <View style={{
            width: 40, height: 40, borderRadius: 13,
            backgroundColor: cfg.bg, alignItems: 'center', justifyContent: 'center', marginRight: 12,
          }}>
            <Ionicons name={cfg.icon} size={20} color={cfg.text} />
          </View>
          <View style={{ flex: 1 }}>
            <NpText style={{ fontSize: 15, fontWeight: '700', marginBottom: 3, lineHeight: 20 }} className="text-foreground">
              {notice.title}
            </NpText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                backgroundColor: cfg.bg, borderRadius: 20,
                paddingHorizontal: 8, paddingVertical: 2,
              }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: cfg.text }}>
                  {cfg.label}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="time-outline" size={11} color={c.mutedForeground} />
                <Text style={{ fontSize: 11, marginLeft: 3 }} className="text-muted-foreground">{timeAgo(date)}</Text>
              </View>
            </View>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18} color={c.mutedForeground}
            style={{ marginTop: 2 }}
          />
        </View>

        {/* Body */}
        {expanded ? (
          <View style={{
            borderRadius: 12, padding: 14,
            borderLeftWidth: 3, borderLeftColor: cfg.text,
          }} className="bg-background">
            <NpText style={{ fontSize: 14, lineHeight: 22 }} className="text-foreground">
              {notice.body}
            </NpText>
          </View>
        ) : (
          <NpText
            numberOfLines={2}
            style={{ fontSize: 13, lineHeight: 20 }}
            className="text-muted-foreground"
          >
            {notice.body}
          </NpText>
        )}

        {!expanded && notice.body.length > 100 && (
          <Text style={{ fontSize: 12, color: cfg.text, fontWeight: '600', marginTop: 6 }}>
            Tap to read more
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function StudentNotices() {
  const [refreshing, setRefreshing] = useState(false);
  const { data: notices, isLoading, isError, refetch } = useNotices();
  const c = useThemeColors();

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} className="bg-background">
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={{ marginTop: 12, fontSize: 14 }} className="text-muted-foreground">Loading notices...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }} className="bg-background">
        <Ionicons name="cloud-offline-outline" size={52} color={c.placeholderIcon} />
        <Text style={{ fontWeight: '600', marginTop: 12, fontSize: 16 }} className="text-foreground">Failed to load notices</Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={{ paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 16 }}
          className="bg-primary"
        >
          <Text style={{ fontWeight: '700' }} className="text-primary-foreground">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      className="bg-background"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
    >
      {/* Header */}
      <LinearGradient
        colors={headerGradient(c.primary) as [string, string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: 56, paddingBottom: 72, paddingHorizontal: 20 }}
      >
        <Text style={{ fontSize: 12, fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
          color: ON_PRIMARY_ACCENTS.bright }}>
          School
        </Text>
        <Text style={{ fontSize: 24, fontWeight: '800', marginBottom: 4 }} className="text-primary-foreground">
          Notices
        </Text>
        {notices && notices.length > 0 && (
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            borderRadius: 20,
            paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 8,
          }} className="bg-white/12">
            <Ionicons name="notifications" size={12} color={ON_PRIMARY_ACCENTS.soft} />
            <Text style={{ fontSize: 12, fontWeight: '600', marginLeft: 5, color: ON_PRIMARY_ACCENTS.soft }}>
              {notices.length} {notices.length === 1 ? 'notice' : 'notices'}
            </Text>
          </View>
        )}
      </LinearGradient>

      <View style={{ marginTop: -52, paddingHorizontal: 16, paddingBottom: 32 }}>
        {!notices || notices.length === 0 ? (
          <View style={{
            borderRadius: 24, padding: 40,
            alignItems: 'center', shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
          }} className="bg-surface">
            <View style={{
              width: 72, height: 72, borderRadius: 24,
              alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            }} className="bg-primary/10">
              <Ionicons name="notifications-off-outline" size={36} color={c.primary} />
            </View>
            <Text style={{ fontSize: 17, fontWeight: '700', marginBottom: 6 }} className="text-foreground">
              No Notices Yet
            </Text>
            <Text style={{ fontSize: 14, textAlign: 'center', lineHeight: 20 }} className="text-muted-foreground">
              Your school hasn't posted any notices. Pull down to refresh.
            </Text>
          </View>
        ) : (
          notices.map((notice) => (
            <NoticeCard key={notice.id} notice={notice} />
          ))
        )}
      </View>
    </ScrollView>
  );
}
