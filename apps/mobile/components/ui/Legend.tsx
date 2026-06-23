import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

export interface LegendItem {
  label: string;
  bg: string;
  border: string;
}

/** Wrapping swatch legend for calendars/charts. */
export function Legend({ items }: { items: LegendItem[] }) {
  const c = useThemeColors();
  return (
    <View style={styles.wrap}>
      {items.map((it) => (
        <View key={it.label} style={styles.item}>
          <View style={[styles.swatch, { backgroundColor: it.bg }]} />
          <Text style={[styles.label, { color: c.mutedForeground }]}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 10, height: 10, borderRadius: 4 },
  label: { fontFamily: FONT.semibold, fontSize: 10.5 },
});
