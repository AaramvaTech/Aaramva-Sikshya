import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import NpText from '../NpText';
import { useThemeColors, headerGradient, deriveOnPrimary } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import { useLocale } from '../../hooks/useLocale';
import { CARD_SHADOW_LG } from './Card';

interface ResultHeroProps {
  gpa: number;
  pct: number;
  grade: string | null;
  /** Student's rank within their section/class for this term. No rank total is
   * available from the API, so the UI never renders "Rank #N of Y" — spec §5. */
  rank: number | null;
  /** Term-over-term GPA delta. Omit/null on a first term (nothing to compare). */
  gpaChange?: number | null;
  /** Term-over-term rank delta. Omit/null on a first term. */
  rankChange?: number | null;
}

function signed(value: number, digits: number): string {
  const fixed = value.toFixed(digits);
  return value >= 0 ? `+${fixed}` : fixed;
}

/**
 * Brand-gradient GPA/Grade hero for the results screen. GPA + aggregate% on the
 * left, Grade + Rank on the right. An optional change strip renders only when at
 * least one of gpaChange/rankChange is supplied — hidden entirely on a first term.
 */
export function ResultHero({ gpa, pct, grade, rank, gpaChange, rankChange }: ResultHeroProps) {
  const c = useThemeColors();
  const { t } = useLocale('student');
  const onPrimary = deriveOnPrimary(c.primary);
  const showChangeStrip = gpaChange != null || rankChange != null;

  return (
    <LinearGradient
      colors={headerGradient(c.primary) as [string, string, string]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, CARD_SHADOW_LG]}
    >
      <View style={styles.row}>
        <View>
          <NpText style={[styles.label, { color: onPrimary.pale }]}>{t('results.gpa')}</NpText>
          <Text style={styles.gpaValue}>{gpa.toFixed(2)}</Text>
          <NpText style={[styles.sub, { color: onPrimary.pale }]}>
            {t('results.aggregatePct', { value: pct })}
          </NpText>
        </View>
        <View style={styles.colRight}>
          <NpText style={[styles.label, { color: onPrimary.pale }]}>{t('results.grade')}</NpText>
          <Text style={styles.gradeValue}>{grade ?? '—'}</Text>
          <NpText style={[styles.sub, { color: onPrimary.pale }]}>
            {rank != null ? t('results.rankHash', { value: rank }) : '—'}
          </NpText>
        </View>
      </View>

      {showChangeStrip && (
        <View style={styles.changeStrip}>
          {gpaChange != null && (
            <View style={styles.changeTile}>
              <NpText style={[styles.changeLabel, { color: onPrimary.pale }]}>
                {t('results.gpaChangeLabel')}
              </NpText>
              <Text style={styles.changeValue}>{signed(gpaChange, 2)}</Text>
            </View>
          )}
          {rankChange != null && (
            <View style={styles.changeTile}>
              <NpText style={[styles.changeLabel, { color: onPrimary.pale }]}>
                {t('results.rankChangeLabel')}
              </NpText>
              <Text style={styles.changeValue}>{signed(rankChange, 0)}</Text>
            </View>
          )}
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 18 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  colRight: { alignItems: 'flex-end' },
  label: { fontFamily: FONT.bold, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.6 },
  sub: { fontFamily: FONT.semibold, fontSize: 11, marginTop: 3 },
  gpaValue: { fontFamily: FONT.extrabold, fontSize: 34, color: '#FFFFFF', marginTop: 2, lineHeight: 38 },
  gradeValue: {
    fontFamily: FONT.extrabold, fontSize: 30, color: '#FFFFFF', marginTop: 2, lineHeight: 34, textAlign: 'right',
  },
  changeStrip: {
    flexDirection: 'row', gap: 10, marginTop: 16, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)',
  },
  changeTile: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 11,
    paddingVertical: 8, paddingHorizontal: 11,
  },
  changeLabel: { fontFamily: FONT.bold, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.4 },
  changeValue: { fontFamily: FONT.extrabold, fontSize: 15, color: '#FFFFFF', marginTop: 3 },
});
