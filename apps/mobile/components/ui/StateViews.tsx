import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

/** Neutral empty state — icon + title + optional helper line. */
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
      <Text className="text-foreground" style={styles.title}>{title}</Text>
      {subtitle ? (
        <Text className="text-muted-foreground" style={styles.subtitle}>{subtitle}</Text>
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

/** Connection/error state with a token-driven Try again button. */
export function ErrorState({
  title = "Couldn't load",
  subtitle = 'Check your connection and try again.',
  onRetry,
  compact = false,
}: ErrorStateProps) {
  const c = useThemeColors();
  return (
    <View style={[styles.center, { paddingVertical: compact ? 28 : 40 }]}>
      <Ionicons name="cloud-offline-outline" size={48} color={c.placeholderIcon} />
      <Text className="text-foreground" style={styles.title}>{title}</Text>
      {subtitle ? (
        <Text className="text-muted-foreground" style={styles.subtitle}>{subtitle}</Text>
      ) : null}
      <TouchableOpacity
        onPress={onRetry}
        className="bg-primary"
        style={styles.retryBtn}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <Text className="text-primary-foreground" style={styles.retryText}>Try again</Text>
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
        <Text className="text-muted-foreground" style={styles.loadingLabel}>{label}</Text>
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
