import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme/colors';

interface MonthNavProps {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  /** "card" sits inside a white card (brand chevrons); "header" sits on the gradient. */
  variant?: 'card' | 'header';
}

/** Chevron ‹ Month Year › navigator for BS-month calendars. */
export function MonthNav({ label, onPrev, onNext, nextDisabled = false, variant = 'card' }: MonthNavProps) {
  const c = useThemeColors();
  const onHeader = variant === 'header';
  const chevronColor = onHeader ? c.primaryForeground : c.primary;

  return (
    <View
      style={[styles.row, onHeader && styles.headerRow]}
      className={onHeader ? 'bg-white/15' : undefined}
    >
      <TouchableOpacity
        onPress={onPrev}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={[styles.btn, !onHeader && { backgroundColor: undefined }]}
        className={onHeader ? undefined : 'bg-primary/10'}
        accessibilityRole="button"
        accessibilityLabel="Previous month"
      >
        <Ionicons name="chevron-back" size={18} color={chevronColor} />
      </TouchableOpacity>

      <Text
        style={[styles.label, onHeader && styles.headerLabel, { color: onHeader ? c.primaryForeground : c.foreground }]}
      >
        {label}
      </Text>

      <TouchableOpacity
        onPress={onNext}
        disabled={nextDisabled}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={[styles.btn, nextDisabled && styles.disabled]}
        className={onHeader ? undefined : 'bg-primary/10'}
        accessibilityRole="button"
        accessibilityLabel="Next month"
        accessibilityState={{ disabled: nextDisabled }}
      >
        <Ionicons name="chevron-forward" size={18} color={chevronColor} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRow: {
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  label: { fontSize: 16, fontWeight: '800' },
  headerLabel: { fontSize: 18, letterSpacing: 0.3 },
});
