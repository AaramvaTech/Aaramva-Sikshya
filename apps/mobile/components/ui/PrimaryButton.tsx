import { TouchableOpacity, ActivityIndicator, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import NpText from '../NpText';
import { Icon } from './Icon';
import type { IconName } from '../../lib/icons/names';
import { useThemeColors, headerGradient } from '../../lib/theme/colors';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  /** Place icon after the label (default: before). */
  iconRight?: boolean;
  loading?: boolean;
  disabled?: boolean;
  /** Outline/ghost variant on a tinted brand surface, or a brand gradient fill. */
  variant?: 'solid' | 'soft' | 'gradient';
  style?: ViewStyle;
}

/**
 * The one primary CTA. Solid brand fill, soft tinted, or gradient fill + loading
 * spinner. Meets the 44pt touch target and shows clear pressed/disabled feedback.
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

  const content = loading ? (
    <ActivityIndicator size="small" color={fg} />
  ) : (
    <>
      {icon && !iconRight && <Icon name={icon} size={18} color={fg} style={styles.iconLeft} />}
      <NpText style={[styles.label, { color: fg }]}>{label}</NpText>
      {icon && iconRight && <Icon name={icon} size={18} color={fg} style={styles.iconRight} />}
    </>
  );

  if (variant === 'gradient') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: isDisabled }}
        style={[isDisabled && styles.disabled, style]}
      >
        <LinearGradient
          colors={headerGradient(c.primary) as [string, string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.button}
        >
          {content}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

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
      {content}
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
