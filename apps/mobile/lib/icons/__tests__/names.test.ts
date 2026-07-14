import { describe, it, expect } from '@jest/globals';
import { MaterialIcons } from '@expo/vector-icons';
import { resolveMaterialName, type IconName } from '../names';

// The full design icon set (Task A1 brief, +4 in Task B1 for PrimaryButton
// caller migration) — kept literal (not re-imported from names.ts) so this
// test can't pass by construction if the union drifts.
const ICON_NAMES: IconName[] = [
  'arrow_back',
  'arrow_forward',
  'assignment_late',
  'battery_full',
  'calculate',
  'calendar_month',
  'campaign',
  'cancel',
  'check',
  'check_circle',
  'chevron_left',
  'chevron_right',
  'done_all',
  'download',
  'edit_note',
  'event',
  'event_upcoming',
  'flag',
  'free_breakfast',
  'groups',
  'help',
  'how_to_reg',
  'lock',
  'logout',
  'mail',
  'meeting_room',
  'menu_book',
  'notifications',
  'payments',
  'person',
  'photo_camera',
  'restaurant',
  'save',
  'schedule',
  'school',
  'search',
  'settings',
  'share',
  'signal_cellular_alt',
  'tag',
  'trending_up',
  'visibility_off',
  'wifi',
  'home',
  'event_available',
  'event_note',
  // Task B1 additions — needed to migrate existing PrimaryButton callers off Ionicons.
  'account_balance_wallet',
  'add_circle',
  'refresh',
  'send',
  // Task C1 additions — Student Home quick-access tiles (Results / Assignments).
  'assignment',
  'grade',
  // Task E5 addition — Student Assignments list/detail attachment rows.
  'attach_file',
];

describe('resolveMaterialName', () => {
  it('covers all 53 design icon names', () => {
    expect(ICON_NAMES.length).toBe(53);
  });

  it.each(ICON_NAMES)('%s resolves to a real MaterialIcons glyph', (name) => {
    const resolved = resolveMaterialName(name);
    expect(MaterialIcons.glyphMap).toHaveProperty(resolved as string);
  });

  it('maps the one special case: event_upcoming has no MaterialIcons glyph of its own', () => {
    expect(resolveMaterialName('event_upcoming')).toBe('event');
  });

  it('replaces underscores with hyphens for the general case', () => {
    expect(resolveMaterialName('check_circle')).toBe('check-circle');
    expect(resolveMaterialName('arrow_back')).toBe('arrow-back');
  });
});
