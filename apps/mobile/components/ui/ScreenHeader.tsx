import { View, Text, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
 * - `plain`    — white band, dark title, muted subtitle. Used for list screens.
 * - `solid`    — flat brand fill, light text. Used for action screens (mark attendance).
 * - `bar`      — white detail bar: back chip + inline 16px title (+ subtitle). Detail screens.
 *
 * Two layout modes on top of the variant:
 * - default — the built-in eyebrow / title / subtitle / children stack.
 * - `bare`  — render ONLY the safe-area + branded frame; the caller supplies every inner
 *             element via children. Used to host the bespoke hero/stat-tile compositions
 *             (dashboards, profiles, attendance) without restyling them. The frame
 *             (top inset, padding, background, border/rounded corners) is owned here;
 *             pass the screen's exact pad/align values so the look is preserved 1:1.
 */
type HeaderVariant = 'gradient' | 'hero' | 'plain' | 'solid' | 'bar';

interface ScreenHeaderProps {
  /** Small uppercase eyebrow above the title (e.g. "MARK ATTENDANCE"). */
  eyebrow?: string;
  /** Optional in `bare` mode (caller supplies content) and in a `bar` with only a back chip. */
  title?: string;
  /** Secondary line under the title (e.g. class · section, or a date). */
  subtitle?: string;
  /** Right-aligned action in the top row (e.g. logout button). */
  right?: ReactNode;
  /** Content rendered below the title block — or, with `bare`, the entire header content. */
  children?: ReactNode;
  /** Add extra bottom padding so the first card can overlap upward (-52). */
  overlap?: boolean;
  /** Render the title with NpText so Devanagari school/child names shape correctly. */
  npTitle?: boolean;
  /** Render the subtitle with NpText (Devanagari child/student names). */
  npSubtitle?: boolean;
  variant?: HeaderVariant;
  /** Back chip on the left (detail `bar` layout). */
  onBack?: () => void;
  /** Smaller 17px title (list/detail headers) instead of the 24px hero title. */
  compact?: boolean;
  /** Render only the branded frame; the caller supplies all inner content via children. */
  bare?: boolean;
  /** Extra top padding beyond the safe-area inset (default 14). */
  padTop?: number;
  /** Bottom padding (default: overlap ? 76 : 26). */
  padBottom?: number;
  /** Horizontal padding (default 20). */
  padH?: number;
  /** Centre the content column (profile heroes). */
  align?: 'left' | 'center';
  /** Rounded bottom corners (24) with no hairline border (attendance headers). */
  rounded?: boolean;
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
  npSubtitle = false,
  variant = 'gradient',
  onBack,
  compact = false,
  bare = false,
  padTop,
  padBottom,
  padH,
  align = 'left',
  rounded = false,
  style,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const onPrimary = deriveOnPrimary(c.primary);
  const TitleText = npTitle ? NpText : Text;
  const SubText = npSubtitle ? NpText : Text;

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
    {
      paddingHorizontal: padH ?? 20,
      paddingTop: insets.top + (padTop ?? 14),
      paddingBottom: padBottom ?? (overlap ? 76 : 26),
    },
    align === 'center' && { alignItems: 'center' as const },
    rounded
      ? { borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }
      : variant === 'plain' || variant === 'bar'
        ? { borderBottomWidth: 1, borderBottomColor: c.border }
        : variant === 'hero'
          ? { borderBottomWidth: 1, borderBottomColor: c.brandBorder }
          : null,
    style,
  ];

  let inner: ReactNode;
  if (bare) {
    inner = children;
  } else if (variant === 'bar') {
    inner = (
      <View style={styles.barRow}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            hitSlop={10}
            style={[styles.backBtn, { backgroundColor: c.background }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={20} color={c.primary} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.barTitles}>
          {title ? <TitleText style={[styles.barTitle, { color: c.foreground }]}>{title}</TitleText> : null}
          {subtitle ? <SubText style={[styles.barSub, { color: c.mutedForeground }]}>{subtitle}</SubText> : null}
        </View>
        {right}
      </View>
    );
  } else {
    inner = (
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

        {title ? (
          <TitleText style={[compact ? styles.titleCompact : styles.title, { color: titleColor }]}>{title}</TitleText>
        ) : null}

        {subtitle ? (
          <SubText style={[compact ? styles.subtitleCompact : styles.subtitle, { color: subtitleColor }]}>{subtitle}</SubText>
        ) : null}

        {children}
      </>
    );
  }

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
  titleCompact: {
    fontFamily: FONT.extrabold,
    fontSize: 17,
  },
  subtitle: {
    fontFamily: FONT.medium,
    fontSize: 13,
    marginTop: 5,
  },
  subtitleCompact: {
    fontFamily: FONT.regular,
    fontSize: 12,
    marginTop: 3,
  },
  // Detail `bar` layout — back chip + inline title block.
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  barTitles: { flex: 1 },
  barTitle: { fontFamily: FONT.extrabold, fontSize: 16 },
  barSub: { fontFamily: FONT.regular, fontSize: 11.5, marginTop: 1 },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
