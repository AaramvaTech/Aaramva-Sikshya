import { Text } from 'react-native';

/**
 * Placeholder BsDate component.
 * Real implementation (BS calendar conversion) happens in Task 10.
 */
export default function BsDate({ isoDate }: { isoDate: string }) {
  return <Text>{isoDate}</Text>;
}
