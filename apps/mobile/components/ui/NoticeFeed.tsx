import { View, Text, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import NpText from '../NpText';
import Skeleton from '../Skeleton';
import { EmptyState, ErrorState } from './StateViews';
import { CARD_SHADOW } from './Card';
import { adToBs, formatBs } from 'bs-calendar';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import { StyleSheet } from 'react-native';

export interface NoticeFeedItem {
  id: string;
  title: string;
  body: string;
  type: string;
  publishedAt: string | null;
  createdAt: string;
}

// Notice type → accent palette (matches the design's notice tags). Semantic, not brand.
const TYPE_CONFIG: Record<string, { tint: string; accent: string; label: string }> = {
  GENERAL:   { tint: '#FEF3E2', accent: '#D9892B', label: 'Notice' },
  EXAM:      { tint: '#FCE9E9', accent: '#E5484D', label: 'Exam' },
  HOLIDAY:   { tint: '#EAF0FE', accent: '#5B7FE0', label: 'Holiday' },
  FEE:       { tint: '#FEF3E2', accent: '#D9892B', label: 'Fee' },
  EVENT:     { tint: '#E4F6F1', accent: '#0E9F77', label: 'Event' },
  EMERGENCY: { tint: '#FCE9E9', accent: '#E5484D', label: 'Emergency' },
};

function typeConfig(type: string) {
  return TYPE_CONFIG[type?.toUpperCase()] ?? TYPE_CONFIG['GENERAL'];
}

function bsDateLabel(dateStr: string): string {
  return formatBs(adToBs(new Date(dateStr)), 'en');
}

function NoticeCard({ notice }: { notice: NoticeFeedItem }) {
  const [expanded, setExpanded] = useState(false);
  const c = useThemeColors();
  const cfg = typeConfig(notice.type);
  const date = notice.publishedAt ?? notice.createdAt;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setExpanded(!expanded)}
      style={[styles.card, CARD_SHADOW, { backgroundColor: c.surface, borderLeftColor: cfg.accent }]}
    >
      <View style={styles.cardTop}>
        <View style={[styles.tag, { backgroundColor: cfg.tint }]}>
          <Text style={[styles.tagText, { color: cfg.accent }]}>{cfg.label}</Text>
        </View>
        <Text style={styles.date}>{bsDateLabel(date)}</Text>
      </View>
      <NpText style={[styles.title, { color: c.foreground }]}>{notice.title}</NpText>
      <NpText numberOfLines={expanded ? undefined : 3} style={[styles.body, { color: c.mutedForeground }]}>
        {notice.body}
      </NpText>
    </TouchableOpacity>
  );
}

interface NoticeFeedProps {
  notices: NoticeFeedItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

/** Shared notice list + states (no header / scroll container). Used by student + parent. */
export function NoticeFeed({ notices, isLoading, isError, onRetry }: NoticeFeedProps) {
  if (isLoading) {
    return (
      <View style={{ gap: 11 }}>
        {[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 96 }} className="rounded-2xl" />)}
      </View>
    );
  }
  if (isError) {
    return (
      <View style={{ paddingTop: 40 }}>
        <ErrorState title="Couldn't load notices" onRetry={onRetry} />
      </View>
    );
  }
  if (!notices || notices.length === 0) {
    return (
      <View style={{ paddingTop: 40 }}>
        <EmptyState
          chip
          icon="notifications-off-outline"
          title="No notices yet"
          subtitle="When your school posts an update, you'll see it here."
        />
      </View>
    );
  }
  return <>{notices.map((n) => <NoticeCard key={n.id} notice={n} />)}</>;
}

// Timestamp caption color (comp: #A6B4AC). Lighter than mutedForeground — de-emphasised
// relative to body text to create visual hierarchy (date < body < title). Neutral, not
// brand-coupled. Documented decorative literal (same pattern as SATURDAY_HIGHLIGHT).
const DATE_COLOR = '#A6B4AC';

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 15, marginBottom: 11, borderLeftWidth: 3 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontFamily: FONT.extrabold, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  date: { fontFamily: FONT.semibold, fontSize: 10.5, color: DATE_COLOR },
  title: { fontFamily: FONT.extrabold, fontSize: 13.5, lineHeight: 18 },
  body: { fontFamily: FONT.regular, fontSize: 12, lineHeight: 18, marginTop: 5 },
});
