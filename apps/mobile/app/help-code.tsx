import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, headerGradient } from '../lib/theme/colors';
import { FONT } from '../lib/theme/fonts';

type BulletItem = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
};

const BULLETS: BulletItem[] = [
  { icon: 'person-outline', label: 'Ask your school\'s admin or office.' },
  { icon: 'receipt-outline', label: 'Check a fee receipt or admission slip.' },
  { icon: 'chatbubble-ellipses-outline', label: 'Look in an SMS from your school.' },
];

export default function HelpCodeScreen() {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();

  return (
    <View style={[styles.flex1]} className="bg-background">
      {/* ---------------------------------------------------------------- */}
      {/* Header strip                                                      */}
      {/* ---------------------------------------------------------------- */}
      <View
        style={[
          styles.headerStrip,
          { paddingTop: insets.top + 8, backgroundColor: c.brandSurface, borderBottomColor: c.brandBorder },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityLabel="Close"
        >
          <Ionicons name="chevron-back" size={22} color={c.primary} />
          <Text style={[styles.backLabel, { color: c.primary }]}>Close</Text>
        </TouchableOpacity>
      </View>

      {/* ---------------------------------------------------------------- */}
      {/* Content                                                           */}
      {/* ---------------------------------------------------------------- */}
      <View style={styles.content}>
        <Text style={styles.title} className="text-foreground">
          Where to find your school code
        </Text>

        {/* Directive bullets */}
        <View style={styles.bulletList}>
          {BULLETS.map((item) => (
            <View key={item.icon} style={styles.bulletRow}>
              <View style={styles.bulletIcon} className="bg-surface-muted">
                <Ionicons name={item.icon} size={20} color={c.mutedForeground} />
              </View>
              <Text style={styles.bulletText} className="text-muted-foreground">
                {item.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Closing line */}
        <View style={styles.closingRow} className="bg-surface border border-border rounded-xl">
          <Ionicons name="information-circle-outline" size={16} color={c.mutedForeground} style={{ marginTop: 1 }} />
          <Text style={styles.closingText} className="text-muted-foreground">
            It usually looks like your school's name, e.g.{' '}
            <Text style={styles.closingExample} className="text-foreground">motherland-school</Text>.
          </Text>
        </View>
      </View>

      {/* ---------------------------------------------------------------- */}
      {/* Got it button                                                     */}
      {/* ---------------------------------------------------------------- */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.gotItButton}
          onPress={() => router.back()}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={headerGradient(c.primary) as [string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gotItFill}
          >
            <Text style={[styles.gotItText, { color: c.primaryForeground }]}>Got it</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles — layout only; colors delegated to className tokens / c.* JS props
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },

  // Header strip
  headerStrip: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingRight: 8,
  },
  backLabel: {
    fontFamily: FONT.semibold,
    fontSize: 15,
    marginLeft: 2,
  },

  // Content
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  title: {
    fontFamily: FONT.extrabold,
    fontSize: 20,
    marginBottom: 24,
    lineHeight: 28,
  },

  // Bullets
  bulletList: {
    gap: 14,
    marginBottom: 24,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bulletIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    flexShrink: 0,
  },
  bulletText: {
    fontFamily: FONT.medium,
    fontSize: 15,
    lineHeight: 22,
    flex: 1,
    paddingTop: 9,
  },

  // Closing note
  closingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 12,
  },
  closingText: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 20,
    marginLeft: 8,
    flex: 1,
  },
  closingExample: {
    fontFamily: FONT.bold,
  },

  // Footer
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  gotItButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 8,
  },
  gotItFill: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gotItText: {
    fontFamily: FONT.bold,
    fontSize: 15,
  },
});
