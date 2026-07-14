import { View, Text, StyleSheet } from 'react-native';
import NpText from '../NpText';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import { gradeColors } from '../../lib/gradeColors';

interface SubjectRowProps {
  name: string;
  obtained: number | null;
  fullMarks: number;
  grade: string | null;
}

/**
 * One subject line on the results screen: name, obtained/full marks, grade
 * chip, and a plain progress bar. No class-average marker and no delta —
 * that comparison data isn't available from the results API (spec §5).
 */
export function SubjectRow({ name, obtained, fullMarks, grade }: SubjectRowProps) {
  const c = useThemeColors();
  const gc = gradeColors(grade);
  const pct = obtained != null && fullMarks > 0
    ? Math.max(0, Math.min(100, (obtained / fullMarks) * 100))
    : 0;

  return (
    <View style={styles.row}>
      <View style={styles.top}>
        <NpText style={[styles.name, { color: c.foreground }]} numberOfLines={1}>
          {name}
        </NpText>
        <Text>
          <Text style={[styles.obtained, { color: c.foreground }]}>{obtained ?? '—'}</Text>
          <Text style={[styles.fullMarks, { color: c.mutedForeground }]}>{`/${fullMarks}`}</Text>
        </Text>
        <View style={[styles.chip, { backgroundColor: gc.bg }]}>
          <Text style={[styles.chipText, { color: gc.fg }]}>{grade ?? '—'}</Text>
        </View>
      </View>
      <View style={[styles.track, { backgroundColor: c.surfaceMuted }]}>
        <View style={[styles.fill, { width: `${pct}%` as `${number}%`, backgroundColor: gc.fg }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flex: 1, fontFamily: FONT.bold, fontSize: 13 },
  obtained: { fontFamily: FONT.bold, fontSize: 12.5 },
  fullMarks: { fontFamily: FONT.medium, fontSize: 12.5 },
  chip: { borderRadius: 7, paddingVertical: 3, paddingHorizontal: 7 },
  chipText: { fontFamily: FONT.extrabold, fontSize: 11 },
  track: { height: 8, borderRadius: 5, overflow: 'hidden', marginTop: 8 },
  fill: { height: 8, borderRadius: 5 },
});
