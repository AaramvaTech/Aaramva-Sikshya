import { Text, type TextProps } from 'react-native';

const DEVANAGARI = /[ऀ-ॿ]/;

interface NpTextProps extends TextProps {
  className?: string;
}

/**
 * Text wrapper that renders Devanagari strings in Noto Sans Devanagari (`font-deva`)
 * and leaves Latin/numeric strings in the default font. Mirrors the web <BsDate> intent.
 */
export default function NpText({ className, children, ...rest }: NpTextProps) {
  const hasDeva = typeof children === 'string' && DEVANAGARI.test(children);
  const cls = `${className ?? ''}${hasDeva ? ' font-deva' : ''}`.trim();
  return (
    <Text className={cls || undefined} {...rest}>
      {children}
    </Text>
  );
}
