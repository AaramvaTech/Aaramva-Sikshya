import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, type ColorValue } from 'react-native';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

function TabIcon({ name, color, focused }: {
  name: keyof typeof Ionicons.glyphMap;
  color: ColorValue;
  focused: boolean;
}) {
  const c = useThemeColors();
  return (
    <View style={{ alignItems: 'center' }}>
      {focused && (
        <View style={{
          width: 4, height: 4, borderRadius: 2,
          backgroundColor: c.primary, marginBottom: 2,
        }} />
      )}
      <Ionicons name={name} size={23} color={color} />
    </View>
  );
}

export default function ParentLayout() {
  const c = useThemeColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.mutedForeground,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 6,
          height: 66,
          elevation: 8,
          shadowColor: '#10231A',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.06,
          shadowRadius: 10,
        },
        tabBarLabelStyle: { fontFamily: FONT.bold, fontSize: 9.5, marginTop: 2 },
        tabBarShowLabel: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'home' : 'home-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Attendance',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'calendar-number' : 'calendar-number-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: 'Results',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'ribbon' : 'ribbon-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="notices"
        options={{
          title: 'Notices',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'megaphone' : 'megaphone-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'person' : 'person-outline'} color={color} focused={focused} />
          ),
        }}
      />
      {/* Reachable via quick-access / kept routes, hidden from the tab bar */}
      <Tabs.Screen name="fees" options={{ href: null }} />
      <Tabs.Screen name="timetable" options={{ href: null }} />
      <Tabs.Screen name="request-leave" options={{ href: null }} />
      <Tabs.Screen name="home" options={{ href: null }} />
      <Tabs.Screen name="profile-details" options={{ href: null }} />
      {/* Notification inbox — opened from the header bell, not a tab */}
      <Tabs.Screen name="inbox" options={{ href: null }} />
    </Tabs>
  );
}
