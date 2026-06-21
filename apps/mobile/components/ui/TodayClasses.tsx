import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NpText from '../NpText';
import { useThemeColors } from '../../lib/theme/colors';
import { subjectColor } from '../../lib/subjects';
import { FONT } from '../../lib/theme/fonts';
import { formatPeriodTime12 } from '../../lib/time';
import { CARD_SHADOW } from './Card';

export interface TodayPeriod {
  slotId: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subjectName: string;
  teacherName: string;
  room: string | null;
}

interface TodayClassesProps {
  periods: TodayPeriod[];
  /** False on Saturdays / when the student isn't enrolled in a class. */
  isSchoolDay: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Compact "today's classes" card used on the student and parent dashboards. */
export function TodayClasses({ periods, isSchoolDay, style }: TodayClassesProps) {
  const c = useThemeColors();
  const empty = !isSchoolDay || periods.length === 0;

  if (empty) {
    return (
      <View style={[styles.card, CARD_SHADOW, style]}>
        <View style={styles.emptyWrap}>
          <Ionicons name="moon-outline" size={36} color={c.placeholderIcon} />
          <Text style={[styles.emptyText, { color: c.mutedForeground }]}>
            {isSchoolDay ? 'No classes today' : 'No school today'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, CARD_SHADOW, style]}>
      {periods.map((p, idx) => {
        const sc = subjectColor(idx);
        const last = idx === periods.length - 1;
        return (
          <View
            key={p.slotId}
            style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: c.border }]}
          >
            <View style={[styles.badge, { backgroundColor: sc.bg }]}>
              <Text style={[styles.badgeText, { color: sc.text }]}>P{p.periodNumber}</Text>
            </View>
            <View style={styles.info}>
              <NpText style={[styles.subject, { color: c.foreground }]}>{p.subjectName}</NpText>
              <NpText style={[styles.meta, { color: c.mutedForeground }]}>
                {p.teacherName}{p.room ? ` · ${p.room}` : ''}
              </NpText>
            </View>
            <Text style={[styles.time, { color: c.mutedForeground }]}>{formatPeriodTime12(p.startTime)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 4 },
  emptyWrap: { alignItems: 'center', paddingVertical: 22 },
  emptyText: { fontFamily: FONT.semibold, fontSize: 13, marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  badge: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: FONT.extrabold, fontSize: 13 },
  info: { flex: 1, minWidth: 0 },
  subject: { fontFamily: FONT.bold, fontSize: 13.5 },
  meta: { fontFamily: FONT.regular, fontSize: 11.5, marginTop: 2 },
  time: { fontFamily: FONT.bold, fontSize: 11 },
});
