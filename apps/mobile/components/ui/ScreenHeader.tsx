import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReactNode } from 'react';
import NpText from '../NpText';
import { useThemeColors, headerGradient, deriveOnPrimary } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

/**
 * Header visual language (per the app design):
 * - `gradient` — saturated brand gradient, light text. The original default.
 * - `hero`     — light brand-tint wash (per-school), dark ink + brand-muted accents.
 *                Used for home/profile "hero" headers.
 * - `plain`    — white band, dark title, muted subtitle. Used for list/detail screens.
 * - `solid`    — flat brand fill, light text. Used for action screens (mark attendance).
 */
type HeaderVariant = 'gradient' | 'hero' | 'plain' | 'solid';

interface ScreenHeaderProps {
  /** Small uppercase eyebrow above the title (e.g. "MARK ATTENDANCE"). */
  eyebrow?: string;
  title: string;
  /** Secondary line under the title (e.g. class · section, or a date). */
  subtitle?: string;
  /** Right-aligned action in the top row (e.g. logout button). */
  right?: ReactNode;
  /** Content rendered below the title block (child picker, month nav, pill). */
  children?: ReactNode;
  /** Add extra bottom padding so the first card can overlap upward (-52). */
  overlap?: boolean;
  /** Render the title with NpText so Devanagari school/child names shape correctly. */
  npTitle?: boolean;
  variant?: HeaderVariant;
  style?: StyleProp<ViewStyle>;
}

/**
 * The single branded header for all role screens. Recolours per school; on-header
 * text stays legible on ANY brand colour. Respects the top safe area (notch).
 */
export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  right,
  children,
  overlap = false,
  npTitle = false,
  variant = 'gradient',
  style,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const onPrimary = deriveOnPrimary(c.primary);
  const TitleText = npTitle ? NpText : Text;

  // Resolve text colours per variant.
  const light = variant === 'gradient' || variant === 'solid';
  const titleColor = light ? c.primaryForeground : c.foreground;
  const eyebrowColor = light ? onPrimary.bright : c.brandMuted;
  const subtitleColor = light
    ? onPrimary.pale
    : variant === 'hero'
      ? c.brandMuted
      : c.mutedForeground;

  const pad: StyleProp<ViewStyle> = [
    styles.header,
    { paddingTop: insets.top + 14, paddingBottom: overlap ? 76 : 26 },
    variant === 'plain' && { borderBottomWidth: 1, borderBottomColor: c.border },
    variant === 'hero' && { borderBottomWidth: 1, borderBottomColor: c.brandBorder },
    style,
  ];

  const inner = (
    <>
      {(eyebrow || right) && (
        <View style={styles.topRow}>
          {eyebrow ? (
            <Text style={[styles.eyebrow, { color: eyebrowColor }]}>{eyebrow}</Text>
          ) : (
            <View />
          )}
          {right}
        </View>
      )}

      <TitleText style={[styles.title, { color: titleColor }]}>{title}</TitleText>

      {subtitle ? (
        <Text style={[styles.subtitle, { color: subtitleColor }]}>{subtitle}</Text>
      ) : null}

      {children}
    </>
  );

  if (variant === 'gradient') {
    return (
      <LinearGradient
        colors={headerGradient(c.primary) as [string, string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={pad}
      >
        {inner}
      </LinearGradient>
    );
  }

  const bg =
    variant === 'hero' ? c.brandSurface : variant === 'solid' ? c.primary : c.surface;

  return <View style={[pad, { backgroundColor: bg }]}>{inner}</View>;
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    minHeight: 24,
  },
  eyebrow: {
    fontFamily: FONT.bold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    fontFamily: FONT.extrabold,
    fontSize: 24,
  },
  subtitle: {
    fontFamily: FONT.medium,
    fontSize: 13,
    marginTop: 5,
  },
});
