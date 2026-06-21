import { Text, StyleSheet } from 'react-native';

interface CardLabelProps {
  children: string;
  style?: object;
}

/** Small uppercase muted section label used at the top of every card. */
export function CardLabel({ children, style }: CardLabelProps) {
  return (
    <Text className="text-muted-foreground" style={[styles.label, style]}>
      {children}
    </Text>
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
