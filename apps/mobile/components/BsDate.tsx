import { Text, View } from 'react-native';
import { adToBs, formatBs } from 'bs-calendar';

interface Props {
  isoDate: string;
  lang?: 'en' | 'np';
}

export default function BsDate({ isoDate, lang = 'en' }: Props) {
  const adDate = new Date(isoDate);
  const bsDate = adToBs(adDate);
  const formatted = formatBs(bsDate, lang);

  return (
    <View className="items-center">
      <Text className="text-base font-medium text-primary">{formatted}</Text>
      <Text className="text-xs text-muted-foreground">{adDate.toLocaleDateString()}</Text>
    </View>
  );
}
