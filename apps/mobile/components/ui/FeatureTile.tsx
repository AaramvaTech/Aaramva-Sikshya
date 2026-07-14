import { TouchableOpacity, View, StyleSheet } from 'react-native';
import NpText from '../NpText';
import { Icon } from './Icon';
import type { IconName } from '../../lib/icons/names';
import { CARD_SHADOW } from './Card';
import { useThemeColors, SEMANTIC_SOFT } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

export function FeatureTile({ icon, label, tint, onPress }: {
  icon: IconName; label: string; tint?: { bg: string; fg: string }; onPress: () => void;
}) {
  const c = useThemeColors();
  const bg = tint?.bg ?? c.brandSurface;
  const fg = tint?.fg ?? c.primary;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={[styles.tile, { backgroundColor: c.surface }, CARD_SHADOW]}>
      <View style={[styles.chip, { backgroundColor: bg }]}><Icon name={icon} size={23} color={fg} /></View>
      <NpText style={[styles.tileLabel, { color: c.foreground }]}>{label}</NpText>
    </TouchableOpacity>
  );
}

export function FeatureButton({ icon, count, label, tone, onPress }: {
  icon: IconName; count: number; label: string; tone: keyof typeof SEMANTIC_SOFT; onPress: () => void;
}) {
  const c = useThemeColors();
  const s = SEMANTIC_SOFT[tone];
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.fbtn, { backgroundColor: s.bg }]}>
      <Icon name={icon} size={22} color={s.fg} />
      <View>
        <NpText style={[styles.fbtnCount, { color: s.fgDeep }]}>{count}</NpText>
        <NpText style={[styles.fbtnLabel, { color: s.fgDeep }]}>{label}</NpText>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: { width: '30.3%', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', gap: 8 },
  chip: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontFamily: FONT.bold, fontSize: 11, textAlign: 'center' },
  fbtn: { flex: 1, borderRadius: 14, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 9 },
  fbtnCount: { fontFamily: FONT.extrabold, fontSize: 16, lineHeight: 18 },
  fbtnLabel: { fontFamily: FONT.bold, fontSize: 9.5, marginTop: 2 },
});
