import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import NpText from '../NpText';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

export function SegmentedPills<T extends string | number>({ items, value, onChange, scroll = false }: {
  items: { key: T; label: string }[]; value: T; onChange: (k: T) => void; scroll?: boolean;
}) {
  const c = useThemeColors();
  const pill = (it: { key: T; label: string }) => {
    const active = it.key === value;
    return (
      <TouchableOpacity key={String(it.key)} onPress={() => onChange(it.key)} activeOpacity={0.8}
        style={[styles.pill, scroll && styles.pillScroll,
          { backgroundColor: active ? c.primary : c.surface, borderColor: c.border, borderWidth: active ? 0 : 1 }]}>
        <NpText style={[styles.pillText, { color: active ? c.primaryForeground : c.mutedForeground }]}>{it.label}</NpText>
      </TouchableOpacity>
    );
  };
  if (scroll) return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>{items.map(pill)}</ScrollView>;
  return <View style={styles.row}>{items.map(pill)}</View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  scrollRow: { flexDirection: 'row', gap: 6, paddingRight: 12 },
  pill: { flex: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center' },
  pillScroll: { flex: 0, paddingHorizontal: 13, borderRadius: 10 },
  pillText: { fontFamily: FONT.extrabold, fontSize: 11 },
});
