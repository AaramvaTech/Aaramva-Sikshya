import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { STATUS_CONFIG, type AttendanceStatus } from '../../lib/attendance';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import { CARD_SHADOW } from './Card';

interface AttendanceSummaryCardProps {
  present: number;
  absent: number;
  late: number;
  leave: number;
  percent: number;
  totalWorkingDays: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Big-percent attendance summary with status chips and a progress bar.
 * The percent + bar render in the school brand colour (matching the design);
 * the status chips keep the semantic attendance palette. Shared by student + parent.
 */
export function AttendanceSummaryCard({
  present, absent, late, leave, percent, totalWorkingDays,
  label = 'Attendance this year', style,
}: AttendanceSummaryCardProps) {
  const c = useThemeColors();
  const chips: { key: AttendanceStatus; count: number }[] = [
    { key: 'PRESENT', count: present },
    { key: 'ABSENT', count: absent },
    { key: 'LATE', count: late },
    { key: 'LEAVE', count: leave },
  ];

  return (
    <View style={[styles.card, CARD_SHADOW, style]}>
      <View style={styles.head}>
        <Text style={[styles.label, { color: c.mutedForeground }]}>{label.toUpperCase()}</Text>
        <Text style={[styles.days, { color: c.primary }]}>{totalWorkingDays} days</Text>
      </View>

      <View style={styles.row}>
        <View style={styles.percentBox}>
          <Text style={[styles.percent, { color: c.primary }]}>{percent}%</Text>
          <Text style={[styles.rate, { color: c.mutedForeground }]}>Present rate</Text>
        </View>

        <View style={styles.chipsGrid}>
          {chips.map(({ key, count }) => {
            const cfg = STATUS_CONFIG[key];
            return (
              <View key={key} style={[styles.chip, { backgroundColor: cfg.bg }]}>
                <Text style={[styles.chipCount, { color: cfg.color }]}>{count}</Text>
                <Text style={[styles.chipLabel, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={[styles.track, { backgroundColor: c.surfaceMuted }]}>
        <View
          style={[styles.fill, { backgroundColor: c.primary, width: `${Math.min(percent, 100)}%` as `${number}%` }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  label: { fontFamily: FONT.bold, fontSize: 10.5, letterSpacing: 0.8 },
  days: { fontFamily: FONT.bold, fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  percentBox: { flexShrink: 0 },
  percent: { fontFamily: FONT.extrabold, fontSize: 34, lineHeight: 36 },
  rate: { fontFamily: FONT.semibold, fontSize: 11, marginTop: 3 },
  chipsGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { width: '47%', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  chipCount: { fontFamily: FONT.extrabold, fontSize: 15 },
  chipLabel: { fontFamily: FONT.bold, fontSize: 9, textTransform: 'uppercase', marginTop: 1 },
  track: { height: 7, borderRadius: 4, overflow: 'hidden', marginTop: 14 },
  fill: { height: 7, borderRadius: 4 },
});
