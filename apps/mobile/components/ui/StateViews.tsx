import { View, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import NpText from '../NpText';
import { useThemeColors } from '../../lib/theme/colors';

type IconName = keyof typeof Ionicons.glyphMap;

// ── Empty state ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  /** Render the icon inside a tinted brand chip (used for friendlier empties). */
  chip?: boolean;
  compact?: boolean;
}

/** Neutral empty state — icon + title + optional helper line. Callers pass
 *  already-translated strings (via t()); text renders through NpText so np
 *  copy uses Noto Sans Devanagari. */
export function EmptyState({ icon, title, subtitle, chip = false, compact = false }: EmptyStateProps) {
  const c = useThemeColors();
  return (
    <View style={[styles.center, { paddingVertical: compact ? 24 : 36 }]}>
      {chip ? (
        <View className="bg-primary/10" style={styles.chip}>
          <Ionicons name={icon} size={32} color={c.primary} />
        </View>
      ) : (
        <Ionicons name={icon} size={44} color={c.placeholderIcon} />
      )}
      <NpText className="text-foreground" style={styles.title}>{title}</NpText>
      {subtitle ? (
        <NpText className="text-muted-foreground" style={styles.subtitle}>{subtitle}</NpText>
      ) : null}
    </View>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

interface ErrorStateProps {
  title?: string;
  subtitle?: string;
  onRetry: () => void;
  compact?: boolean;
}

/** Connection/error state with a token-driven Try again button. Defaults come
 *  from the common namespace so a bare <ErrorState onRetry> is localized. */
export function ErrorState({ title, subtitle, onRetry, compact = false }: ErrorStateProps) {
  const c = useThemeColors();
  const { t } = useTranslation('common');
  const resolvedTitle = title ?? t('state.errorTitle');
  const resolvedSubtitle = subtitle ?? t('state.errorSubtitle');
  return (
    <View style={[styles.center, { paddingVertical: compact ? 28 : 40 }]}>
      <Ionicons name="cloud-offline-outline" size={48} color={c.placeholderIcon} />
      <NpText className="text-foreground" style={styles.title}>{resolvedTitle}</NpText>
      {resolvedSubtitle ? (
        <NpText className="text-muted-foreground" style={styles.subtitle}>{resolvedSubtitle}</NpText>
      ) : null}
      <TouchableOpacity
        onPress={onRetry}
        className="bg-primary"
        style={styles.retryBtn}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('action.tryAgain')}
      >
        <NpText className="text-primary-foreground" style={styles.retryText}>{t('action.tryAgain')}</NpText>
      </TouchableOpacity>
    </View>
  );
}

// ── Inline loading ────────────────────────────────────────────────────────────

export function LoadingBlock({ label }: { label?: string }) {
  const c = useThemeColors();
  return (
    <View style={[styles.center, { paddingVertical: 32 }]}>
      <ActivityIndicator size="small" color={c.primary} />
      {label ? (
        <NpText className="text-muted-foreground" style={styles.loadingLabel}>{label}</NpText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  chip: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 16, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  subtitle: { fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 19 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 11, borderRadius: 12, marginTop: 16 },
  retryText: { fontWeight: '700', fontSize: 14 },
  loadingLabel: { fontSize: 13, marginTop: 8 },
});
