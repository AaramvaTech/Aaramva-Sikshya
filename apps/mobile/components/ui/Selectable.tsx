import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { useThemeColors } from '../../lib/theme/colors';

// ── Radio-style selectable row ────────────────────────────────────────────────

interface SelectableRowProps {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  right?: ReactNode;
}

/** Bordered row with a radio dot; brand-tinted when selected. */
export function SelectableRow({ title, subtitle, selected, onPress, right }: SelectableRowProps) {
  const c = useThemeColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={selected ? 'border-primary bg-primary/5' : 'border-border bg-surface'}
      style={styles.row}
    >
      <View
        className={selected ? 'border-primary' : 'border-border'}
        style={styles.radioOuter}
      >
        {selected && <View className="bg-primary" style={styles.radioInner} />}
      </View>
      <View style={styles.rowText}>
        <Text className="text-foreground" style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text className="text-muted-foreground" style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ?? (selected ? <Ionicons name="checkmark-circle" size={20} color={c.primary} /> : null)}
    </TouchableOpacity>
  );
}

// ── Pill toggle chip ──────────────────────────────────────────────────────────

interface SelectChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/** Compact pill toggle (leave types, filters). */
export function SelectChip({ label, selected, onPress }: SelectChipProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={selected ? 'border-primary bg-primary/10' : 'border-border bg-surface'}
      style={styles.chip}
    >
      <Text
        className={selected ? 'text-primary' : 'text-foreground'}
        style={styles.chipText}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    minHeight: 56,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowSubtitle: { fontSize: 12, marginTop: 2 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1.5,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipText: { fontSize: 13, fontWeight: '600' },
});
