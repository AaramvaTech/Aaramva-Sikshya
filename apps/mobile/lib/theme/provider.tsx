import { createContext, useContext, useState, useMemo, useCallback, ReactNode } from 'react';
import { View } from 'react-native';
import { vars } from 'nativewind';
import { aaramvaTheme, hexToRgbChannels } from './tokens';

type Branding = {
  primaryColor?: string;
  primaryForeground?: string;
  logoUrl?: string;
  name?: string;
};
type Ctx = { branding: Branding | null; applySchool: (b: Branding) => void; reset: () => void };

const ThemeCtx = createContext<Ctx>(null!);
export const useBranding = () => useContext(ThemeCtx);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding | null>(null);

  const applySchool = useCallback((b: Branding) => setBranding(b), []);
  const reset = useCallback(() => setBranding(null), []);

  // IMPORTANT: always emit a vars() object — never undefined — even before branding
  // loads. NativeWind treats "a component that sets a CSS variable" specially: it
  // UPGRADES the View into a VariableContext.Provider. If `style` goes from undefined
  // (no vars) on the first render to a vars() object once ThemeSync resolves branding,
  // NativeWind changes the component TYPE mid-flight and REMOUNTS the whole subtree —
  // which here contains the <Stack> navigator, producing
  // "Couldn't find a navigation context" on the remount.
  // By always returning vars() (Aaramva defaults until a school overrides them) the
  // component is a Provider from render #1 and only ever updates its value — no remount.
  const style = useMemo(() => {
    return vars({
      '--primary': branding?.primaryColor
        ? hexToRgbChannels(branding.primaryColor)
        : aaramvaTheme['--primary'],
      '--primary-foreground': branding?.primaryForeground
        ? hexToRgbChannels(branding.primaryForeground)
        : aaramvaTheme['--primary-foreground'],
    });
  }, [branding]);

  const value = useMemo(() => ({ branding, applySchool, reset }), [branding, applySchool, reset]);

  return (
    <ThemeCtx.Provider value={value}>
      <View style={style} className="flex-1 bg-background">
        {children}
      </View>
    </ThemeCtx.Provider>
  );
}
