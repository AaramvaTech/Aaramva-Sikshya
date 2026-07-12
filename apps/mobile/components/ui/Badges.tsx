import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import NpText from '../NpText';
import { Ionicons } from '@expo/vector-icons';

type IconName = keyof typeof Ionicons.glyphMap;

// ── Status badge (semantic colours passed in) ─────────────────────────────────

interface StatusBadgeProps {
  label: string;
  bg: string;
  color: string;
}

/** Small rounded pill for a status/category. Colours are caller-provided. */
export function StatusBadge({ label, bg, color }: StatusBadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <NpText style={[styles.badgeText, { color }]}>{label}</NpText>
    </View>
  );
}

// ── Header pill (count chip on the gradient header) ───────────────────────────

interface HeaderPillProps {
  icon: IconName;
  label: string;
  /** On-primary tint for the icon/text so it reads on the brand header. */
  tint: string;
}

export function HeaderPill({ icon, label, tint }: HeaderPillProps) {
  return (
    <View className="bg-white/12" style={styles.pill}>
      <Ionicons name={icon} size={12} color={tint} />
      <NpText style={[styles.pillText, { color: tint }]}>{label}</NpText>
    </View>
  );
}

// ── Header icon button (logout / right action) ────────────────────────────────

interface HeaderIconButtonProps {
  icon: IconName;
  onPress: () => void;
  color: string;
  label: string;
}

export function HeaderIconButton({ icon, onPress, color, label }: HeaderIconButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={styles.iconBtn}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  pillText: { fontSize: 12, fontWeight: '600', marginLeft: 5 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
