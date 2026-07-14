import type { MaterialIcons } from '@expo/vector-icons';

/**
 * Task A1 — offline substitution note:
 *
 * The target design specifies Google's "Material Symbols" icon font. This
 * dev environment has no network access, so that font (and its glyph
 * codepoints) cannot be fetched. `MaterialIcons` — Material Symbols'
 * predecessor, bundled with `@expo/vector-icons` (already installed, ships
 * its own font + glyphmap) — speaks the same icon language and covers every
 * name the design uses, with one mapped exception (`event_upcoming`, which
 * has no MaterialIcons glyph of its own and falls back to `event`).
 *
 * `Icon` (`components/ui/Icon.tsx`) wraps `MaterialIcons` so call sites only
 * ever see the design's snake_case icon names via `IconName` — swapping in a
 * true Material Symbols font later is a one-file change (this file +
 * `Icon.tsx`), not a call-site migration.
 */

/**
 * The design's 46 Material icon names (snake_case), as used by the target canvas,
 * plus 4 added in Task B1 (`account_balance_wallet`, `add_circle`, `refresh`, `send`)
 * to migrate existing `PrimaryButton` callers off Ionicons — verified against
 * MaterialIcons' glyphMap, not part of the original design canvas. Plus 2 added
 * in Task C1 (`assignment`, `grade`) for the Student Home quick-access tiles
 * (Assignments / Results) — also verified against MaterialIcons' glyphMap. Plus 1 added
 * in Task E5 (`attach_file`) for the Student Assignments list/detail attachment rows —
 * also verified against MaterialIcons' glyphMap. Plus 1 added in Task S2P3 (`error`) for
 * the Parent request-leave error banner (replacing Ionicons `alert-circle`) — also
 * verified against MaterialIcons' glyphMap.
 */
export type IconName =
  | 'account_balance_wallet'
  | 'add_circle'
  | 'arrow_back'
  | 'arrow_forward'
  | 'assignment'
  | 'assignment_late'
  | 'attach_file'
  | 'battery_full'
  | 'calculate'
  | 'calendar_month'
  | 'campaign'
  | 'cancel'
  | 'check'
  | 'check_circle'
  | 'chevron_left'
  | 'chevron_right'
  | 'done_all'
  | 'download'
  | 'edit_note'
  | 'error'
  | 'event'
  | 'event_upcoming'
  | 'flag'
  | 'free_breakfast'
  | 'grade'
  | 'groups'
  | 'help'
  | 'how_to_reg'
  | 'lock'
  | 'logout'
  | 'mail'
  | 'meeting_room'
  | 'menu_book'
  | 'notifications'
  | 'payments'
  | 'person'
  | 'photo_camera'
  | 'refresh'
  | 'restaurant'
  | 'save'
  | 'schedule'
  | 'school'
  | 'search'
  | 'send'
  | 'settings'
  | 'share'
  | 'signal_cellular_alt'
  | 'tag'
  | 'trending_up'
  | 'visibility_off'
  | 'wifi'
  | 'home'
  | 'event_available'
  | 'event_note';

/**
 * Maps a design icon name (snake_case) to a MaterialIcons glyph key
 * (kebab-case). Special case: `event_upcoming` has no MaterialIcons
 * equivalent, so it falls back to the visually closest glyph, `event`.
 */
export function resolveMaterialName(name: IconName): keyof typeof MaterialIcons.glyphMap {
  if (name === 'event_upcoming') return 'event';
  return name.replace(/_/g, '-') as keyof typeof MaterialIcons.glyphMap;
}
