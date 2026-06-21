import { View, type ViewProps, type ViewStyle, StyleSheet } from 'react-native';
import { ReactNode } from 'react';

// Single source of truth for card elevation — keeps every surface on the same
// shadow scale (UX rule: elevation-consistent). iOS reads shadow*, Android elevation.
// Tinted near-black green (#10231A) so the elevation reads warm, matching the design.
export const CARD_SHADOW: ViewStyle = {
  shadowColor: '#10231A',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.1,
  shadowRadius: 14,
  elevation: 2,
};

// Stronger shadow for hero cards that overlap the header.
export const CARD_SHADOW_LG: ViewStyle = {
  shadowColor: '#10231A',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.12,
  shadowRadius: 20,
  elevation: 4,
};

interface CardProps extends ViewProps {
  children: ReactNode;
  /** Apply default 16px inner padding. Set false for edge-to-edge content (lists). */
  padded?: boolean;
  /** Use the larger overlap shadow + 20px radius (hero cards over headers). */
  elevated?: boolean;
  className?: string;
}

/** Token-driven surface card. Colours come from `bg-surface`; shadow is shared. */
export function Card({ children, padded = true, elevated = false, className, style, ...rest }: CardProps) {
  return (
    <View
      className={`bg-surface ${elevated ? 'rounded-3xl' : 'rounded-2xl'} ${className ?? ''}`.trim()}
      style={[
        elevated ? CARD_SHADOW_LG : CARD_SHADOW,
        padded ? styles.padded : styles.unpadded,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  padded: { padding: 16 },
  unpadded: { overflow: 'hidden' },
});
