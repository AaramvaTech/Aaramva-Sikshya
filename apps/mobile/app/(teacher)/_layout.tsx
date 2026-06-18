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
          backgroundColor: '#1e40af', marginBottom: 2,
        }} />
      )}
      <Ionicons name={name} size={24} color={color} />
    </View>
  );
}

export default function TeacherLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1e40af',
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
          title: 'Home',
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
            <TabIcon name={focused ? 'checkbox' : 'checkbox-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-attendance"
        options={{
          title: 'My Record',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'stats-chart' : 'stats-chart-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="leave"
        options={{
          title: 'Leave',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'document-text' : 'document-text-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="marks"
        options={{
          title: 'Marks',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'pencil' : 'pencil-outline'} color={color} focused={focused} />
          ),
        }}
      />
      {/* Legacy placeholder — hidden from tab bar */}
      <Tabs.Screen name="home" options={{ href: null }} />
    </Tabs>
  );
}
