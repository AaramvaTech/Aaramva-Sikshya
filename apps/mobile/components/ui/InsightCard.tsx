import { View, StyleSheet } from 'react-native';
import NpText from '../NpText';
import { Icon } from './Icon';
import type { IconName } from '../../lib/icons/names';
import { useThemeColors, SEMANTIC_SOFT } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

interface InsightCardProps {
  tone: 'success' | 'warning';
  icon: IconName;
  label: string;
  subject: string;
  detail: string;
}

/**
 * Small tinted insight tile for the results screen — top-subject
 * (tone="success", icon="trending_up") or needs-focus (tone="warning",
 * icon="flag") callouts. `label`/`subject`/`detail` are caller-supplied,
 * already-translated strings; this component only owns tone presentation.
 */
export function InsightCard({ tone, icon, label, subject, detail }: InsightCardProps) {
  const c = useThemeColors();
  const s = SEMANTIC_SOFT[tone];
  return (
    <View style={[styles.tile, { backgroundColor: s.bg }]}>
      <View style={styles.header}>
        <Icon name={icon} size={16} color={s.fg} />
        <NpText style={[styles.label, { color: s.fgDeep }]}>{label}</NpText>
      </View>
      <NpText style={[styles.subject, { color: c.foreground }]} numberOfLines={1}>
        {subject}
      </NpText>
      <NpText style={[styles.detail, { color: s.fg }]}>{detail}</NpText>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, borderRadius: 16, padding: 13 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  label: { fontFamily: FONT.bold, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.4 },
  subject: { fontFamily: FONT.extrabold, fontSize: 13 },
  detail: { fontFamily: FONT.bold, fontSize: 11, marginTop: 3 },
});
