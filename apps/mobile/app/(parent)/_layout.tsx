import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, type ColorValue } from 'react-native';

function TabIcon({ name, color, focused }: {
  name: keyof typeof Ionicons.glyphMap;
  color: ColorValue;
  focused: boolean;
}) {
  return (
    <View style={{ alignItems: 'center' }}>
      {focused && (
        <View style={{
          width: 4, height: 4, borderRadius: 2,
          backgroundColor: '#1e3a5f', marginBottom: 2,
        }} />
      )}
      <Ionicons name={name} size={24} color={color} />
    </View>
  );
}

export default function ParentLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1e3a5f',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#eff6ff',
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 4,
          height: 64,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
        tabBarShowLabel: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
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
            <TabIcon name={focused ? 'stats-chart' : 'stats-chart-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="timetable"
        options={{
          title: 'Timetable',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'calendar' : 'calendar-outline'} color={color} focused={focused} />
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
        name="fees"
        options={{
          title: 'Fees',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'card' : 'card-outline'} color={color} focused={focused} />
          ),
        }}
      />
      {/* Placeholder from session 20 — hidden from tab bar */}
      <Tabs.Screen name="home" options={{ href: null }} />
    </Tabs>
  );
}
