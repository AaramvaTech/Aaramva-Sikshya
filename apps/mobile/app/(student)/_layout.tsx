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
          backgroundColor: '#065f46', marginBottom: 2,
        }} />
      )}
      <Ionicons name={name} size={24} color={color} />
    </View>
  );
}

export default function StudentLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#065f46',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#f0fdf4',
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
        name="timetable"
        options={{
          title: 'Timetable',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'calendar' : 'calendar-outline'} color={color} focused={focused} />
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
        name="notices"
        options={{
          title: 'Notices',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'notifications' : 'notifications-outline'} color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
