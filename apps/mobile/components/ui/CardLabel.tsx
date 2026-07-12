import { StyleSheet } from 'react-native';
import NpText from '../NpText';

interface CardLabelProps {
  children: string;
  style?: object;
}

/** Small uppercase muted section label used at the top of every card. */
export function CardLabel({ children, style }: CardLabelProps) {
  return (
    <NpText className="text-muted-foreground" style={[styles.label, style]}>
      {children}
    </NpText>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
});
