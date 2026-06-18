import {
  View, Text, ScrollView, ActivityIndicator,
  TouchableOpacity, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { useNotices } from '../../hooks/useStudentMe';
import type { NoticeItem } from '../../types';
import { adToBs, formatBs } from 'bs-calendar';

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
  const cfg = typeConfig(notice.type);
  const date = notice.publishedAt ?? notice.createdAt;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setExpanded(!expanded)}
      style={{
        backgroundColor: 'white', borderRadius: 20, marginBottom: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
        overflow: 'hidden',
      }}
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
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 3, lineHeight: 20 }}>
              {notice.title}
            </Text>
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
                <Ionicons name="time-outline" size={11} color="#9ca3af" />
                <Text style={{ fontSize: 11, color: '#9ca3af', marginLeft: 3 }}>{timeAgo(date)}</Text>
              </View>
            </View>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18} color="#9ca3af"
            style={{ marginTop: 2 }}
          />
        </View>

        {/* Body */}
        {expanded ? (
          <View style={{
            backgroundColor: '#f9fafb', borderRadius: 12, padding: 14,
            borderLeftWidth: 3, borderLeftColor: cfg.text,
          }}>
            <Text style={{ fontSize: 14, color: '#374151', lineHeight: 22 }}>
              {notice.body}
            </Text>
          </View>
        ) : (
          <Text
            numberOfLines={2}
            style={{ fontSize: 13, color: '#6b7280', lineHeight: 20 }}
          >
            {notice.body}
          </Text>
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

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#065f46" />
        <Text style={{ color: '#9ca3af', marginTop: 12, fontSize: 14 }}>Loading notices...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Ionicons name="cloud-offline-outline" size={52} color="#d1d5db" />
        <Text style={{ color: '#374151', fontWeight: '600', marginTop: 12, fontSize: 16 }}>Failed to load notices</Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={{ backgroundColor: '#065f46', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 16 }}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f9fafb' }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#065f46" />}
    >
      {/* Header */}
      <LinearGradient
        colors={['#064e3b', '#065f46', '#047857']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: 56, paddingBottom: 72, paddingHorizontal: 20 }}
      >
        <Text style={{ color: '#6ee7b7', fontSize: 12, fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          School
        </Text>
        <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 4 }}>
          Notices
        </Text>
        {notices && notices.length > 0 && (
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20,
            paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 8,
          }}>
            <Ionicons name="notifications" size={12} color="#a7f3d0" />
            <Text style={{ color: '#a7f3d0', fontSize: 12, fontWeight: '600', marginLeft: 5 }}>
              {notices.length} {notices.length === 1 ? 'notice' : 'notices'}
            </Text>
          </View>
        )}
      </LinearGradient>

      <View style={{ marginTop: -52, paddingHorizontal: 16, paddingBottom: 32 }}>
        {!notices || notices.length === 0 ? (
          <View style={{
            backgroundColor: 'white', borderRadius: 24, padding: 40,
            alignItems: 'center', shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
          }}>
            <View style={{
              width: 72, height: 72, borderRadius: 24,
              backgroundColor: '#d1fae5', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            }}>
              <Ionicons name="notifications-off-outline" size={36} color="#065f46" />
            </View>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 6 }}>
              No Notices Yet
            </Text>
            <Text style={{ fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 20 }}>
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
