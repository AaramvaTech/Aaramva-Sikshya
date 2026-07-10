import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BsDate from '../components/BsDate';
import { logout } from '../lib/session';
import { useThemeColors } from '../lib/theme/colors';
import { FONT } from '../lib/theme/fonts';

export default function WebPortalScreen() {
  const c = useThemeColors();

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <View style={[styles.iconWrap, { backgroundColor: `${c.primary}14` }]}>
        <Ionicons name="desktop-outline" size={30} color={c.primary} />
      </View>
      <Text style={[styles.title, { color: c.foreground }]}>Use the Web Portal</Text>
      <Text style={[styles.message, { color: c.mutedForeground }]}>
        Administrative features are available at{'\n'}aaramvashikshya.com
      </Text>
      <BsDate isoDate={new Date().toISOString()} />

      <TouchableOpacity
        style={[styles.signOut, { backgroundColor: `${c.danger}14`, borderColor: `${c.danger}40` }]}
        onPress={() => { void logout(); }}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        activeOpacity={0.85}
      >
        <Ionicons name="log-out-outline" size={19} color={c.danger} style={{ marginRight: 8 }} />
        <Text style={[styles.signOutText, { color: c.danger }]}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: { fontFamily: FONT.extrabold, fontSize: 22, textAlign: 'center', marginBottom: 12 },
  message: { fontFamily: FONT.regular, fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  signOut: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    alignSelf: 'stretch', height: 48, marginTop: 28, borderRadius: 14, borderWidth: 1.5,
  },
  signOutText: { fontFamily: FONT.bold, fontSize: 14 },
});
