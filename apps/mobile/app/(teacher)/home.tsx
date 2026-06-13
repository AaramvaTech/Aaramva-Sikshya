import { View, Text } from 'react-native';
import BsDate from '../../components/BsDate';

export default function TeacherHome() {
  return (
    <View className="flex-1 bg-white items-center justify-center p-6">
      <Text className="text-2xl font-bold mb-2">Teacher Dashboard</Text>
      <Text className="text-gray-500 mb-6">Coming in Session 21</Text>
      <BsDate isoDate={new Date().toISOString()} />
    </View>
  );
}
