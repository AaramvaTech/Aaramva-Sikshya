import { useEffect, useRef } from 'react';
import { Animated, type ViewStyle, type StyleProp } from 'react-native';

interface SkeletonProps {
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/** Neutral pulsing placeholder for loading states. Uses bg-surface-muted via className. */
export default function Skeleton({ className, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      className={`bg-surface-muted rounded-xl ${className ?? ''}`.trim()}
      style={[{ opacity }, style]}
    />
  );
}
