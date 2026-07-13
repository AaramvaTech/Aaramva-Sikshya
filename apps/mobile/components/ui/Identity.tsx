import { View, Text, Image, StyleSheet } from 'react-native';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

function initialsOf(name: string, max = 2): string {
  return name.trim().split(/\s+/).slice(0, max).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

export function SchoolBadge({ name, logoUrl, size = 34 }: { name: string; logoUrl?: string | null; size?: number }) {
  const c = useThemeColors();
  const r = Math.round(size * 0.3);
  if (logoUrl) {
    return (
      <View style={[styles.sq, { width: size, height: size, borderRadius: r, backgroundColor: c.surface }]}>
        <Image source={{ uri: logoUrl }} style={{ width: size * 0.7, height: size * 0.7 }} resizeMode="contain" />
      </View>
    );
  }
  return (
    <View style={[styles.sq, { width: size, height: size, borderRadius: r, backgroundColor: c.primary }]}>
      <Text style={{ fontFamily: FONT.extrabold, fontSize: size * 0.37, color: c.primaryForeground, letterSpacing: 0.5 }}>{initialsOf(name)}</Text>
    </View>
  );
}

export function AvatarBadge({ initials, size = 38, ring = false }: { initials: string; size?: number; ring?: boolean }) {
  const c = useThemeColors();
  return (
    <View style={[styles.sq, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.primary },
      ring && { borderWidth: 2, borderColor: c.surface }]}>
      <Text style={{ fontFamily: FONT.extrabold, fontSize: size * 0.37, color: c.primaryForeground }}>{initials}</Text>
    </View>
  );
}
const styles = StyleSheet.create({ sq: { alignItems: 'center', justifyContent: 'center' } });
