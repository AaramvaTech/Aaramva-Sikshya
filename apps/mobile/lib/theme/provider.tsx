import { createContext, useContext, useState, useMemo, ReactNode } from 'react';
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

  const style = useMemo(() => {
    if (!branding?.primaryColor) return undefined;
    return vars({
      '--primary': hexToRgbChannels(branding.primaryColor),
      '--primary-foreground': hexToRgbChannels(branding.primaryForeground ?? '#FFFFFF'),
    });
  }, [branding]);

  const value = useMemo(
    () => ({ branding, applySchool: setBranding, reset: () => setBranding(null) }),
    [branding]
  );

  return (
    <ThemeCtx.Provider value={value}>
      <View style={style} className="flex-1 bg-background">
        {children}
      </View>
    </ThemeCtx.Provider>
  );
}
