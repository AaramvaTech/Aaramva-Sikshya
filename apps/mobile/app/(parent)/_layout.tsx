import { Tabs } from 'expo-router';
import { View, type ColorValue } from 'react-native';
import { Icon } from '../../components/ui';
import type { IconName } from '../../lib/icons/names';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

function TabIcon({ name, color, focused }: {
  name: IconName;
  color: ColorValue;
  focused: boolean;
}) {
  const c = useThemeColors();
  return (
    <View
      style={{
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 3,
        borderRadius: 11,
        backgroundColor: focused ? c.brandSurface : 'transparent',
      }}
    >
      <Icon name={name} size={22} color={color as string} fill={focused} />
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
            <TabIcon name="home" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Attendance',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="event_available" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: 'Results',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="grade" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="notices"
        options={{
          title: 'Notices',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="campaign" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="person" color={color} focused={focused} />
          ),
        }}
      />
      {/* Reachable via quick-access / kept routes, hidden from the tab bar */}
      <Tabs.Screen name="fees" options={{ href: null }} />
      <Tabs.Screen name="timetable" options={{ href: null }} />
      <Tabs.Screen name="request-leave" options={{ href: null }} />
      <Tabs.Screen name="profile-details" options={{ href: null }} />
      {/* Notification inbox — opened from the header bell, not a tab */}
      <Tabs.Screen name="inbox" options={{ href: null }} />
      {/* EDU-2 assignments — reachable from Home quick access */}
      <Tabs.Screen name="assignments" options={{ href: null }} />
    </Tabs>
  );
}
