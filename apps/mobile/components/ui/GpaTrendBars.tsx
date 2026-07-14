import { View, Text, StyleSheet } from 'react-native';
import NpText from '../NpText';
import { Card } from './Card';
import { CardLabel } from './CardLabel';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import { useLocale } from '../../hooks/useLocale';

const MAX_GPA = 4.0;
const BAR_AREA_HEIGHT = 88;
const MIN_BAR_HEIGHT = 8;
const BAR_WIDTH = 44;

interface GpaTrendBarsProps {
  data: { label: string; gpa: number }[];
}

/**
 * Mini term-over-term GPA bar chart. Hidden entirely below two data points — a
 * trend line needs at least two terms to mean anything (spec §5).
 */
export function GpaTrendBars({ data }: GpaTrendBarsProps) {
  const c = useThemeColors();
  const { t } = useLocale('student');

  if (data.length < 2) return null;

  return (
    <Card style={styles.card}>
      <CardLabel>{t('results.gpaTrend')}</CardLabel>
      <View style={styles.row}>
        {data.map((point) => {
          const height = Math.max(MIN_BAR_HEIGHT, (Math.min(point.gpa, MAX_GPA) / MAX_GPA) * BAR_AREA_HEIGHT);
          return (
            <View key={point.label} style={styles.col}>
              <Text style={[styles.value, { color: c.foreground }]}>{point.gpa.toFixed(1)}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { height, backgroundColor: c.primary }]} />
              </View>
              <NpText style={[styles.label, { color: c.mutedForeground }]} numberOfLines={1}>
                {point.label}
              </NpText>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18 },
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around' },
  col: { alignItems: 'center', flex: 1 },
  value: { fontFamily: FONT.bold, fontSize: 11, marginBottom: 4 },
  barTrack: { height: BAR_AREA_HEIGHT, justifyContent: 'flex-end' },
  bar: { width: BAR_WIDTH, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  label: { fontFamily: FONT.semibold, fontSize: 10, marginTop: 6 },
});
