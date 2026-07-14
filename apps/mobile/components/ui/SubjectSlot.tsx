import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import NpText from '../NpText';
import { Icon } from './Icon';
import { useThemeColors } from '../../lib/theme/colors';
import { formatPeriodTime } from '../../lib/time';
import { FONT } from '../../lib/theme/fonts';
import type { SubjectColor } from '../../lib/subjects';
import type { IconName } from '../../lib/icons/names';

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
  /**
   * When truthy the card highlights this period as NOW (small inline pill, brand
   * primary background). Pass any non-empty string — "HAPPENING NOW" / "NOW" / etc.
   */
  banner?: string;
  /** Card-level style override (highlight / dim for current/past periods). */
  style?: ViewStyle;
}

/**
 * One timetable period rendered as a colour-accented card.
 *
 * Layout: time gutter (start / period-badge / end) on the left, then a card with
 * a tinted subject-icon square, subject name + optional NOW pill, teacher/room
 * meta, and a period-number pill pinned to the top-right corner.
 *
 * Subject hue comes from lib/subjects.ts (SUBJECT_PALETTE). All neutrals are
 * token-driven via useThemeColors(). The NOW badge uses c.primary so it recolours
 * per school — never a hardcoded brand hex.
 */
export function SubjectSlot({
  color, startTime, endTime, periodNumber, subjectName, meta = [], banner, style,
}: SubjectSlotProps) {
  const c = useThemeColors();
  const isNow = Boolean(banner);

  return (
    <View style={styles.row}>
      {/* ── Left time gutter ─────────────────────────────────── */}
      <View style={styles.gutter}>
        <Text style={[styles.gutterTimeStart, { color: c.foreground, fontFamily: FONT.extrabold }]}>
          {formatPeriodTime(startTime)}
        </Text>
        <Text style={[styles.gutterTimeEnd, { color: c.mutedForeground, fontFamily: FONT.semibold }]}>
          {formatPeriodTime(endTime)}
        </Text>
      </View>

      {/* ── Period card ───────────────────────────────────────── */}
      <View
        style={[
          styles.card,
          { backgroundColor: c.surface },
          style,
        ]}
      >
        {/* Period-number pill — top-right corner */}
        <View style={[styles.cornerPill, { backgroundColor: color.bg }]}>
          <Text style={[styles.cornerPillText, { color: color.text, fontFamily: FONT.extrabold }]}>
            P{periodNumber}
          </Text>
        </View>

        <View style={styles.cardBody}>
          {/* Tinted icon square */}
          <View style={[styles.iconSquare, { backgroundColor: color.bg }]}>
            <Icon name="menu_book" size={22} color={color.text} />
          </View>

          {/* Subject info */}
          <View style={styles.info}>
            {/* Subject name + NOW badge */}
            <View style={styles.nameRow}>
              <NpText
                style={[styles.subjectName, { color: c.foreground, fontFamily: FONT.extrabold }]}
                numberOfLines={1}
              >
                {subjectName}
              </NpText>
              {isNow && (
                <View style={[styles.nowBadge, { backgroundColor: c.primary }]}>
                  <Text style={[styles.nowText, { fontFamily: FONT.extrabold }]}>{banner}</Text>
                </View>
              )}
            </View>

            {/* Meta row (teacher / room) */}
            {meta.length > 0 && (
              <View style={styles.metaRow}>
                {meta.map((m, i) => (
                  <View key={i} style={styles.metaItem}>
                    <Icon name={m.icon} size={13} color={c.mutedForeground} />
                    <NpText style={[styles.metaText, { color: c.mutedForeground, fontFamily: FONT.semibold }]}>
                      {m.text}
                    </NpText>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Outer row: time gutter + card side-by-side */
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    alignItems: 'center',
  },

  /* Time gutter ─────────────────────── */
  gutter: {
    width: 52,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  gutterTimeStart: {
    fontSize: 13,
    textAlign: 'center',
  },
  gutterTimeEnd: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 1,
  },

  /* Card ────────────────────────────── */
  card: {
    flex: 1,
    borderRadius: 16,
    padding: 13,
    paddingRight: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
    overflow: 'visible',
  },
  cornerPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    zIndex: 1,
  },
  cornerPillText: {
    fontSize: 10,
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 36, // leave room for corner pill
  },

  /* Tinted icon square */
  iconSquare: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  /* Info column */
  info: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'wrap',
  },
  subjectName: {
    fontSize: 13.5,
    flexShrink: 1,
  },
  nowBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  nowText: {
    fontSize: 8.5,
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },

  /* Meta */
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 5,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 11,
  },
});
