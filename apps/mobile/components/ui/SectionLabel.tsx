import { StyleSheet, type TextStyle, type StyleProp } from 'react-native';
import { ReactNode } from 'react';
import NpText from '../NpText';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

export function SectionLabel({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const c = useThemeColors();
  return <NpText style={[styles.label, { color: c.foreground }, style]}>{children}</NpText>;
}
const styles = StyleSheet.create({ label: { fontFamily: FONT.extrabold, fontSize: 12, letterSpacing: 0.2 } });
