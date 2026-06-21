import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NpText from '../NpText';
import { useThemeColors } from '../../lib/theme/colors';
import { formatPeriodTime } from '../../lib/time';
import type { SubjectColor } from '../../lib/subjects';

type IconName = keyof typeof Ionicons.glyphMap;

export interface SlotMeta {
  icon: IconName;
  text: string;
}

interface SubjectSlotProps {
  color: SubjectColor;
  startTime: string;
  endTime: string;
  periodNumber: number;
  subjectName: string;
  subjectCode?: string | null;
  meta?: SlotMeta[];
  /** Optional coloured banner across the top (e.g. "HAPPENING NOW"). */
  banner?: string;
  /** Right-aligned badge next to the code (e.g. "UPCOMING"). */
  tag?: string;
  /** Card-level style override (highlight / dim for current/past periods). */
  style?: ViewStyle;
}

/**
 * One timetable period rendered as a colour-accented card: a time column with a
 * period badge on the left and subject + meta on the right. Subject hue comes from
 * the shared SUBJECT_PALETTE; all neutrals are token-driven.
 */
export function SubjectSlot({
  color, startTime, endTime, periodNumber, subjectName, subjectCode, meta = [], banner, tag, style,
}: SubjectSlotProps) {
  const c = useThemeColors();
  return (
    <View style={[styles.card, { backgroundColor: c.surface }, style]}>
      {banner ? (
        <View style={[styles.banner, { backgroundColor: color.bar }]}>
          <View style={[styles.bannerDot, { backgroundColor: '#FFFFFF' }]} />
          <Text style={[styles.bannerText, { color: '#FFFFFF' }]}>{banner}</Text>
        </View>
      ) : null}

      <View style={styles.body}>
        {/* Left color accent */}
        <View style={{ width: 5, backgroundColor: color.bar }} />

        {/* Time column */}
        <View style={[styles.timeCol, { borderRightWidth: 1, borderRightColor: c.border }]}>
          <Text style={[styles.time, { color: c.mutedForeground }]}>{formatPeriodTime(startTime)}</Text>
          <View style={[styles.periodBadge, { backgroundColor: color.bg }]}>
            <Text style={[styles.periodText, { color: color.text }]}>P{periodNumber}</Text>
          </View>
          <Text style={[styles.time, { color: c.mutedForeground }]}>{formatPeriodTime(endTime)}</Text>
        </View>

        {/* Info */}
        <View style={styles.info}>
          <View style={styles.codeRow}>
            {subjectCode ? (
              <View style={[styles.codeBadge, { backgroundColor: color.bg }]}>
                <Text style={[styles.codeText, { color: color.text }]}>{subjectCode}</Text>
              </View>
            ) : null}
            {tag ? (
              <View style={[styles.tag, { backgroundColor: `${c.primary}1A` }]}>
                <Text style={[styles.tagText, { color: c.primary }]}>{tag}</Text>
              </View>
            ) : null}
          </View>

          <NpText style={[styles.subject, { color: c.foreground }]}>{subjectName}</NpText>

          {meta.length > 0 && (
            <View style={styles.metaRow}>
              {meta.map((m, i) => (
                <View key={i} style={styles.metaItem}>
                  <Ionicons name={m.icon} size={12} color={c.mutedForeground} />
                  <NpText style={[styles.metaText, { color: c.mutedForeground }]}>{m.text}</NpText>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  banner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6 },
  bannerDot: { width: 7, height: 7, borderRadius: 4, marginRight: 7 },
  bannerText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  body: { flexDirection: 'row' },
  timeCol: { width: 62, alignItems: 'center', justifyContent: 'center', paddingVertical: 16, marginRight: 14 },
  time: { fontSize: 11, fontWeight: '600' },
  periodBadge: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginVertical: 6 },
  periodText: { fontSize: 11, fontWeight: '800' },
  info: { flex: 1, paddingVertical: 14, paddingRight: 12 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  codeBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  codeText: { fontSize: 11, fontWeight: '700' },
  tag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 10, fontWeight: '700' },
  subject: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center' },
  metaText: { fontSize: 12, marginLeft: 4 },
});
