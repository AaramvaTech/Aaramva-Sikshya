import { View, StyleSheet } from 'react-native';
import NpText from '../NpText';
import { SEMANTIC_SOFT } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

export function StatTile({ value, label, tone }: { value: string | number; label: string; tone: keyof typeof SEMANTIC_SOFT }) {
  const s = SEMANTIC_SOFT[tone];
  return (
    <View style={[styles.tile, { backgroundColor: s.bg }]}>
      <NpText style={[styles.value, { color: s.fg }]}>{value}</NpText>
      <NpText style={[styles.label, { color: s.fg }]}>{label}</NpText>
    </View>
  );
}
const styles = StyleSheet.create({
  tile: { flex: 1, borderRadius: 13, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center' },
  value: { fontFamily: FONT.extrabold, fontSize: 19, lineHeight: 20 },
  label: { fontFamily: FONT.extrabold, fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 3 },
});
