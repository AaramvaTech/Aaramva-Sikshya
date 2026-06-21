import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { NotoSansDevanagari_400Regular } from '@expo-google-fonts/noto-sans-devanagari';

// Font map passed to useFonts() in the root layout. The KEY is the fontFamily name
// referenced at runtime. Keep `NotoSansDevanagari` spelled exactly so it matches the
// tailwind `font-deva` family mapping used by <NpText>.
export const APP_FONTS = {
  NotoSansDevanagari: NotoSansDevanagari_400Regular,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
};

// Semantic font-family tokens. React Native cannot synthesize weights for a custom
// font — each weight is a SEPARATE family. Select the family (not `fontWeight`) when
// you need a specific weight, e.g. `{ fontFamily: FONT.bold }`.
export const FONT = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;
