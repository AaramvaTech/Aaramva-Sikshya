import { Text, TouchableOpacity, ActivityIndicator, StyleSheet, type ViewStyle } from 'react-native';
import NpText from '../NpText';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme/colors';

type IconName = keyof typeof Ionicons.glyphMap;

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  /** Place icon after the label (default: before). */
  iconRight?: boolean;
  loading?: boolean;
  disabled?: boolean;
  /** Outline/ghost variant on a tinted brand surface instead of solid fill. */
  variant?: 'solid' | 'soft';
  style?: ViewStyle;
}

/**
 * The one primary CTA. Solid brand fill (or soft tinted) + loading spinner.
 * Meets the 44pt touch target and shows clear pressed/disabled feedback.
 */
export function PrimaryButton({
  label,
  onPress,
  icon,
  iconRight = false,
  loading = false,
  disabled = false,
  variant = 'solid',
  style,
}: PrimaryButtonProps) {
  const c = useThemeColors();
  const isSoft = variant === 'soft';
  const fg = isSoft ? c.primary : c.primaryForeground;
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
      className={isSoft ? 'bg-primary/10' : 'bg-primary'}
      style={[styles.button, isDisabled && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon && !iconRight && <Ionicons name={icon} size={18} color={fg} style={styles.iconLeft} />}
          <NpText style={[styles.label, { color: fg }]}>{label}</NpText>
          {icon && iconRight && <Ionicons name={icon} size={18} color={fg} style={styles.iconRight} />}
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  disabled: { opacity: 0.55 },
  label: { fontSize: 15, fontWeight: '800' },
  iconLeft: { marginRight: 8 },
  iconRight: { marginLeft: 8 },
});
