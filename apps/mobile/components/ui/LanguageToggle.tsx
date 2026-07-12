import { View, TouchableOpacity, StyleSheet } from 'react-native';
import NpText from '../NpText';
import { useLocale } from '../../hooks/useLocale';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import type { AppLocale } from '../../lib/i18n';

const OPTIONS: { value: AppLocale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'np', label: 'नेपाली' }, // native endonym — always shown in Nepali
];

/**
 * Language selector (I18N-1). A parent who cannot read English must be able to
 * find this without hunting, so it lives BOTH on the login screen and in each
 * app's profile settings. The `नेपाली` label is always in Nepali script (via
 * NpText → Noto Sans Devanagari) so it is recognizable regardless of the
 * current locale.
 */
export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useLocale();
  const c = useThemeColors();

  return (
    <View style={[styles.row, compact && styles.rowCompact, { backgroundColor: c.brandSurface }]}>
      {OPTIONS.map((opt) => {
        const selected = locale === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => { void setLocale(opt.value); }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.pill,
              compact && styles.pillCompact,
              { backgroundColor: selected ? c.primary : 'transparent' },
            ]}
          >
            <NpText
              style={[
                styles.label,
                { color: selected ? c.primaryForeground : c.mutedForeground },
              ]}
            >
              {opt.label}
            </NpText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderRadius: 12, padding: 4, gap: 4 },
  rowCompact: { padding: 3, gap: 3 },
  pill: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingVertical: 10 },
  pillCompact: { paddingVertical: 7, paddingHorizontal: 14, flex: 0 },
  label: { fontFamily: FONT.bold, fontSize: 14 },
});
