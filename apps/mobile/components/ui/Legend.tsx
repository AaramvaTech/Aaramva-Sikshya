import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '../../lib/theme/colors';

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
          <View style={[styles.swatch, { backgroundColor: it.bg, borderColor: it.border }]} />
          <Text style={[styles.label, { color: c.foreground }]}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1.5 },
  label: { fontSize: 12, fontWeight: '500' },
});
