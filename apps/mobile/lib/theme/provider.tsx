import { createContext, useContext, useState, useMemo, useCallback, ReactNode } from 'react';
import { View } from 'react-native';
import { vars } from 'nativewind';
import { hexToRgbChannels } from './tokens';

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

  const style = useMemo(() => {
    if (!branding?.primaryColor) return undefined;
    return vars({
      '--primary': hexToRgbChannels(branding.primaryColor),
      '--primary-foreground': hexToRgbChannels(branding.primaryForeground ?? '#FFFFFF'),
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
