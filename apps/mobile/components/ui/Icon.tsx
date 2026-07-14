import { MaterialIcons } from '@expo/vector-icons';
import type { TextStyle } from 'react-native';
import { resolveMaterialName, type IconName } from '../../lib/icons/names';

/**
 * Shared icon primitive for the redesign. Renders the design's Material icon
 * set via `@expo/vector-icons`' `MaterialIcons` — see `lib/icons/names.ts`
 * for why (offline env, true Material Symbols font unavailable). Screens
 * migrating off `Ionicons` should render `<Icon name="check_circle" />`
 * using the design's snake_case names; this component + `resolveMaterialName`
 * do the translation.
 */
interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /**
   * No-op today — MaterialIcons ships a single filled style, so there is no
   * outlined variant to toggle. The prop exists so call sites are already
   * forward-compatible with a future true Material Symbols swap, where
   * `fill` would pick the filled vs outlined glyph.
   */
  fill?: boolean;
  style?: TextStyle;
}

export function Icon({ name, size = 22, color = '#000', style }: IconProps) {
  return <MaterialIcons name={resolveMaterialName(name)} size={size} color={color} style={style} />;
}
