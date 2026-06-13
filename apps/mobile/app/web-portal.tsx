import { View, Text } from 'react-native';
import BsDate from '../components/BsDate';

export default function WebPortalScreen() {
  return (
    <View className="flex-1 bg-white items-center justify-center p-6">
      <Text className="text-2xl font-bold text-center mb-4">Use the Web Portal</Text>
      <Text className="text-gray-500 text-center mb-6">
        Administrative features are available at{'\n'}aaramvashikshya.com
      </Text>
      <BsDate isoDate={new Date().toISOString()} />
    </View>
  );
}
