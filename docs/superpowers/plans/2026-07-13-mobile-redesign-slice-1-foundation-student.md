# Mobile Redesign — Slice 1 (Foundation + Student) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the `apps/mobile` **Student** role to the claude.ai design canvas, plus the shared design-system foundation that Parent/Teacher/Auth slices will reuse.

**Architecture:** Delta refactor on an already-parity-close base. A prior "mobile-design-parity" pass already built the `hero`/`bar` `ScreenHeader` variants, the elevation-scale `Card`, the per-school tint helpers (`brandSurface` etc.), and a hero-band Home. The new work is: a Material Symbols `Icon` component, a handful of net-new primitives, per-screen design deltas (the "Today" module, Results insights/trend, per-tile tints), and migrating Ionicons → `Icon`. Restyle-only — `apps/api` untouched, only data the current API returns.

**Tech Stack:** Expo SDK 56, expo-router, React Native, NativeWind v4, `@expo/vector-icons` (`createIconSet`), `@expo-google-fonts/material-symbols`, i18next, `bs-calendar`, Jest (`jest-expo`).

## Global Constraints

- **`apps/api` and `apps/web` MUST NOT be modified.** Zero diff outside `apps/mobile`.
- **Brand colour only via `useThemeColors()` / NativeWind tokens** (`bg-primary`, `text-foreground`, `bg-surface`, `text-muted-foreground`). No brand hex literals in components/screens. The mockup maroon `#98293B` is the demo tenant's `--primary`; app default is Aaramva green `#0B6B43`.
- **Per-school tint = `useThemeColors().brandSurface`** (already derived from the resolved primary; maroon→~`#F8ECEE`, green→`#E9F4EE`). Do **not** add a `--primary-soft` token or touch `ThemeSync` — the tint is computed at read time in `lib/theme/colors.ts`.
- **Decorative palettes stay literals** (documented exceptions, like `SATURDAY_HIGHLIGHT` / `STATUS_CONFIG` / `subjectColor`): semantic soft-pairs, subject hues. Never replace them with `--primary`.
- **All user-facing strings via i18n** (`t()` + `NpText`); new keys added to BOTH `en` and `np` under the `student`/`common` namespaces. New/changed Nepali strings are added to the I18N-1 human-review doc — the session does NOT self-certify Nepali quality.
- **BS dates** via `bs-calendar` `formatBs`/`todayBs` (Nepali month names when locale=np). All dates stored/queried AD, converted at display.
- **Text renders through `NpText`** in every component that shows translated copy (Devanagari font shaping).
- **Verification gate for every task:** `npx tsc --noEmit` exits 0 in `apps/mobile`. Adding a new route file requires regenerating expo-router typed routes (`npx expo start --offline` briefly) before local tsc passes (POL-2 gotcha) — no new routes are planned in this slice.
- **Commit after every task.** Branch: `feat/mobile-redesign-slice-1` (already created).

### Pre-existing foundation (reuse, do NOT rebuild)
- `ScreenHeader` variants `hero` (soft-tint, `rounded`, `bare` mode) and `bar` (back chip + title/subtitle) — `components/ui/ScreenHeader.tsx`. Home/attendance/profile use `hero`; detail screens use `bar`.
- `Card` + `CARD_SHADOW` / `CARD_SHADOW_LG` — `components/ui/Card.tsx`.
- Tint helpers in `lib/theme/colors.ts`: `useThemeColors()` returns `primary, primaryForeground, foreground, mutedForeground, success, warning, danger, info, background, surface, border, brandSurface, brandBorder, brandMuted`. Plus `headerGradient(primary)`, `deriveOnPrimary(primary)`, `SATURDAY_HIGHLIGHT`, `PLACEHOLDER_ICON`.
- Existing shared UI (barrel `components/ui/index.ts`): `AttendanceSummaryCard`, `AttendanceCalendar`, `TodayClasses`, `SubjectSlot`, `NoticeFeed`, `NotificationInbox`, `HeaderBell`, `Legend`, `MonthNav`, `Selectable`, `LanguageToggle`, `StatusBadge`/`HeaderPill`/`HeaderIconButton`, `CardLabel`, `StateViews`.
- Student data hooks: `hooks/useStudentMe.ts` (`useMyProfile`, `useMyTimetable`, `useMyAttendanceSummary`, `useAttendanceHistory`, results/report-card hooks), `hooks/useLocale.ts` (`useLocale`, `bsLang`).

---

## Phase A — Icon system

> **OFFLINE REVISION (2026-07-13, authoritative — supersedes the original A1/A2 below).**
> This environment has **no network**, so the true Material Symbols Rounded font +
> codepoints cannot be fetched. Phase A is rebuilt on `@expo/vector-icons` **`MaterialIcons`**
> (installed; bundles its own font + glyphmap; Material Symbols' predecessor, same Material
> icon language). Verified name coverage: **45 of 46** design icons (only `event_upcoming`
> missing → map to `event`). This **collapses A1+A2 into one task (A1-revised)** and drops the
> glyphmap generation, the codepoints fetch, and the `@expo-google-fonts/material-symbols`
> dependency. The `Icon` public API is unchanged (`name`/`size`/`color`/`fill`), so B4/C1/D2 and
> every screen consume it exactly as written; a future networked swap to true Material Symbols is
> localized to `Icon.tsx` + the name map. **B4 needs no glyphmap regen** — `home`, `event_available`,
> `event_note`, `campaign`, `person` all exist in MaterialIcons.
>
> **Task A1-revised — `Icon` over MaterialIcons.** Files: create `apps/mobile/lib/icons/names.ts`
> (`export type IconName` = the 46 design snake_case names; `export function resolveMaterialName(n: IconName): keyof typeof MaterialIcons.glyphMap` — replace `_`→`-`, special-case `event_upcoming`→`event`), create `apps/mobile/components/ui/Icon.tsx`
> (`Icon({ name, size=22, color='#000', fill=false, style })` wrapping `<MaterialIcons name={resolveMaterialName(name)} .../>`; `fill` accepted + documented no-op since MaterialIcons is a single filled style), export both from the barrel. Tests: `lib/icons/__tests__/names.test.ts` — every `IconName` resolves to a key present in `MaterialIcons.glyphMap` (import the glyphmap JSON), and `resolveMaterialName('event_upcoming') === 'event'`. TDD: write the resolution test first (RED), implement, GREEN. Font: `MaterialIcons` self-loads via `@expo/vector-icons`; no `APP_FONTS` change needed. `npx tsc --noEmit` exits 0; commit `feat(mobile): Icon component over MaterialIcons (offline Material icon set)`.
>
> The original A1/A2 below are RETAINED for context only — do not execute their codepoints/font steps.

### Task A1 (ORIGINAL — superseded, do not execute): Curated glyphmap for the 43 used icons

**Files:**
- Create: `apps/mobile/scripts/gen-icon-glyphmap.mjs`
- Create: `apps/mobile/lib/icons/glyphmap.ts`
- Modify: `apps/mobile/package.json` (add `@expo-google-fonts/material-symbols` to `dependencies` — already in `node_modules` as a transitive; pin it explicitly)

**Interfaces:**
- Produces: `export const MATERIAL_GLYPHS: Record<string, number>` — a name→codepoint map covering exactly the 43 icons the design uses.

The 43 names (from the design canvas): `arrow_back arrow_forward assignment_late battery_full calculate calendar_month campaign cancel check check_circle chevron_left chevron_right done_all download edit_note event event_upcoming flag free_breakfast groups help how_to_reg lock logout mail meeting_room menu_book notifications payments person photo_camera restaurant save schedule school search settings share signal_cellular_alt tag trending_up visibility_off wifi`.

- [ ] **Step 1: Write the generator script**

Codepoints are identical across Material Symbols Outlined/Rounded/Sharp. The generator reads Google's published codepoints file (a two-column `name codepoint` text file) and emits only the used subset. Fetch the codepoints file once into the repo first:

```
# one-time: download the codepoints list next to the script (engineer runs this)
# https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/MaterialSymbolsRounded%5BFILL%2CGRAD%2Copsz%2Cwght%5D.codepoints
# save as apps/mobile/scripts/material-symbols.codepoints
```

```js
// apps/mobile/scripts/gen-icon-glyphmap.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const USED = 'arrow_back arrow_forward assignment_late battery_full calculate calendar_month campaign cancel check check_circle chevron_left chevron_right done_all download edit_note event event_upcoming flag free_breakfast groups help how_to_reg lock logout mail meeting_room menu_book notifications payments person photo_camera restaurant save schedule school search settings share signal_cellular_alt tag trending_up visibility_off wifi'.split(' ');

const lines = readFileSync(join(here, 'material-symbols.codepoints'), 'utf8').trim().split('\n');
const all = new Map(lines.map((l) => { const [n, cp] = l.trim().split(/\s+/); return [n, parseInt(cp, 16)]; }));

const missing = USED.filter((n) => !all.has(n));
if (missing.length) { console.error('Missing codepoints for:', missing.join(', ')); process.exit(1); }

const entries = USED.sort().map((n) => `  ${n}: 0x${all.get(n).toString(16)},`).join('\n');
const out = `// AUTO-GENERATED by scripts/gen-icon-glyphmap.mjs — do not edit by hand.\n// Material Symbols codepoints for the icons used in the app.\nexport const MATERIAL_GLYPHS: Record<string, number> = {\n${entries}\n};\n`;
writeFileSync(join(here, '..', 'lib', 'icons', 'glyphmap.ts'), out, 'utf8');
console.log('Wrote glyphmap for', USED.length, 'icons');
```

- [ ] **Step 2: Run the generator**

Run: `cd apps/mobile && node scripts/gen-icon-glyphmap.mjs`
Expected: `Wrote glyphmap for 43 icons` and `lib/icons/glyphmap.ts` created with 43 numeric entries.

- [ ] **Step 3: Write a test that every used name resolved**

```ts
// apps/mobile/lib/icons/__tests__/glyphmap.test.ts
import { MATERIAL_GLYPHS } from '../glyphmap';

const USED = 'arrow_back arrow_forward assignment_late battery_full calculate calendar_month campaign cancel check check_circle chevron_left chevron_right done_all download edit_note event event_upcoming flag free_breakfast groups help how_to_reg lock logout mail meeting_room menu_book notifications payments person photo_camera restaurant save schedule school search settings share signal_cellular_alt tag trending_up visibility_off wifi'.split(' ');

describe('MATERIAL_GLYPHS', () => {
  it('has a positive codepoint for every used icon name', () => {
    for (const name of USED) {
      expect(typeof MATERIAL_GLYPHS[name]).toBe('number');
      expect(MATERIAL_GLYPHS[name]).toBeGreaterThan(0);
    }
  });
  it('has no extra names beyond the used set', () => {
    expect(Object.keys(MATERIAL_GLYPHS).sort()).toEqual([...USED].sort());
  });
});
```

- [ ] **Step 4: Run test**

Run: `cd apps/mobile && npm test -- glyphmap`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/scripts/gen-icon-glyphmap.mjs apps/mobile/scripts/material-symbols.codepoints apps/mobile/lib/icons/glyphmap.ts apps/mobile/lib/icons/__tests__/glyphmap.test.ts apps/mobile/package.json
git commit -m "feat(mobile): Material Symbols glyphmap for the 43 used icons"
```

---

### Task A2: `Icon` component + font registration

**Files:**
- Create: `apps/mobile/components/ui/Icon.tsx`
- Modify: `apps/mobile/lib/theme/fonts.ts` (add the Material Symbols family to `APP_FONTS`)
- Modify: `apps/mobile/components/ui/index.ts` (export `Icon`, `type IconName`)

**Interfaces:**
- Consumes: `MATERIAL_GLYPHS` (Task A1).
- Produces:
  - `export type IconName = keyof typeof MATERIAL_GLYPHS`
  - `export function Icon(props: { name: IconName; size?: number; color?: string; fill?: boolean; style?: TextStyle }): JSX.Element`

**Font note (v1 vs fast-follow).** v1 uses the already-installed `@expo-google-fonts/material-symbols` **static Outlined** family (`MaterialSymbols_400Regular`) for guaranteed availability. The `fill` prop is accepted and forwarded but is a **no-op in v1** (static Outlined can't render FILL 1). Call sites still pass `fill` so a fast-follow can register a Rounded+Filled TTF and make it live without touching screens. Document this in the component header.

- [ ] **Step 1: Register the font family**

In `apps/mobile/lib/theme/fonts.ts`, import and add to `APP_FONTS`:

```ts
import { MaterialSymbols_400Regular } from '@expo-google-fonts/material-symbols';
// ...inside APP_FONTS object add:
  MaterialSymbols_400Regular,
```

- [ ] **Step 2: Write the Icon component**

```tsx
// apps/mobile/components/ui/Icon.tsx
// Material Symbols icon. v1 renders the installed static Outlined family via a
// codepoint glyphmap (reliable on native + web). `fill` is accepted for forward
// compat but is a no-op until a Rounded+Filled TTF is registered (fast-follow).
import { createIconSet } from '@expo/vector-icons';
import type { TextStyle } from 'react-native';
import { MATERIAL_GLYPHS } from '../../lib/icons/glyphmap';

export type IconName = keyof typeof MATERIAL_GLYPHS;

const MaterialSymbols = createIconSet(MATERIAL_GLYPHS, 'MaterialSymbols_400Regular');

export function Icon({
  name,
  size = 22,
  color = '#000',
  fill: _fill = false, // reserved: FILL 1 lands with the Rounded+Filled family
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  fill?: boolean;
  style?: TextStyle;
}) {
  return <MaterialSymbols name={name} size={size} color={color} style={style} />;
}
```

- [ ] **Step 3: Export from the barrel**

In `apps/mobile/components/ui/index.ts` add:

```ts
export { Icon, type IconName } from './Icon';
```

- [ ] **Step 4: Verify types compile**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Render smoke test**

```tsx
// apps/mobile/components/ui/__tests__/Icon.test.tsx
import renderer from 'react-test-renderer';
import { Icon } from '../Icon';

it('renders a known icon without throwing', () => {
  const tree = renderer.create(<Icon name="check_circle" size={24} color="#0E9F77" fill />);
  expect(tree.toJSON()).toBeTruthy();
});
```

Run: `cd apps/mobile && npm test -- Icon`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/components/ui/Icon.tsx apps/mobile/lib/theme/fonts.ts apps/mobile/components/ui/index.ts apps/mobile/components/ui/__tests__/Icon.test.tsx
git commit -m "feat(mobile): Icon component (Material Symbols via createIconSet)"
```

---

## Phase B — Foundation primitives

### Task B1: Semantic soft-pairs + gradient `PrimaryButton`

**Files:**
- Modify: `apps/mobile/lib/theme/colors.ts` (add `SEMANTIC_SOFT`)
- Modify: `apps/mobile/components/ui/PrimaryButton.tsx` (add `gradient` variant; migrate its icon to `Icon`)
- Test: `apps/mobile/lib/theme/__tests__/semanticSoft.test.ts`

**Interfaces:**
- Produces:
  - `export const SEMANTIC_SOFT: Record<'success'|'warning'|'info'|'danger'|'neutral', { fg: string; fgDeep: string; bg: string }>`
  - `PrimaryButton` gains `variant?: 'solid' | 'soft' | 'gradient'` and `icon?: IconName` (Material Symbols).

- [ ] **Step 1: Add the decorative soft-pairs (literals, documented exception)**

In `apps/mobile/lib/theme/colors.ts`, after `SATURDAY_HIGHLIGHT`:

```ts
// Decorative semantic soft-pairs used by tinted tiles/chips/insights across the
// design. Documented literal exception (like SATURDAY_HIGHLIGHT / STATUS_CONFIG):
// NOT brand-coupled — never replace with --primary. fg = accent, fgDeep = darker
// label ink, bg = soft tint surface.
export const SEMANTIC_SOFT = {
  success: { fg: '#0E9F77', fgDeep: '#0B7B5C', bg: '#E4F6F1' },
  warning: { fg: '#D9892B', fgDeep: '#B9721F', bg: '#FEF3E2' },
  info:    { fg: '#5B7FE0', fgDeep: '#4A6BC8', bg: '#EAF0FE' },
  danger:  { fg: '#E5484D', fgDeep: '#C93A3F', bg: '#FDF1F1' },
  neutral: { fg: '#5C7068', fgDeep: '#3F554B', bg: '#F1F4F1' },
} as const;
```

- [ ] **Step 2: Write the soft-pair test**

```ts
// apps/mobile/lib/theme/__tests__/semanticSoft.test.ts
import { SEMANTIC_SOFT } from '../colors';

it('every semantic soft-pair has fg/fgDeep/bg hex values', () => {
  for (const key of ['success', 'warning', 'info', 'danger', 'neutral'] as const) {
    for (const slot of ['fg', 'fgDeep', 'bg'] as const) {
      expect(SEMANTIC_SOFT[key][slot]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  }
});
```

Run: `cd apps/mobile && npm test -- semanticSoft` → PASS.

- [ ] **Step 3: Add the `gradient` variant to `PrimaryButton`**

Replace the icon import (`Ionicons`) with `Icon`, change `icon?: IconName`, add the `gradient` branch using `headerGradient(c.primary)` + `expo-linear-gradient` (already a dep). Full replacement of `PrimaryButton.tsx`:

```tsx
import { Text, TouchableOpacity, ActivityIndicator, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import NpText from '../NpText';
import { Icon, type IconName } from './Icon';
import { useThemeColors, headerGradient } from '../../lib/theme/colors';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  iconRight?: boolean;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'solid' | 'soft' | 'gradient';
  style?: ViewStyle;
}

export function PrimaryButton({
  label, onPress, icon, iconRight = false, loading = false,
  disabled = false, variant = 'solid', style,
}: PrimaryButtonProps) {
  const c = useThemeColors();
  const isSoft = variant === 'soft';
  const fg = isSoft ? c.primary : c.primaryForeground;
  const isDisabled = disabled || loading;

  const content = loading ? (
    <ActivityIndicator size="small" color={fg} />
  ) : (
    <>
      {icon && !iconRight && <Icon name={icon} size={18} color={fg} style={styles.iconLeft} />}
      <NpText style={[styles.label, { color: fg }]}>{label}</NpText>
      {icon && iconRight && <Icon name={icon} size={18} color={fg} style={styles.iconRight} />}
    </>
  );

  if (variant === 'gradient') {
    return (
      <TouchableOpacity onPress={onPress} disabled={isDisabled} activeOpacity={0.85}
        accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: isDisabled }}
        style={[isDisabled && styles.disabled, style]}>
        <LinearGradient colors={headerGradient(c.primary) as [string, string, string]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.button}>
          {content}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} disabled={isDisabled} activeOpacity={0.85}
      accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: isDisabled }}
      className={isSoft ? 'bg-primary/10' : 'bg-primary'}
      style={[styles.button, isDisabled && styles.disabled, style]}>
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  disabled: { opacity: 0.55 },
  label: { fontSize: 15, fontWeight: '800' },
  iconLeft: { marginRight: 8 },
  iconRight: { marginLeft: 8 },
});
```

> Note: existing `PrimaryButton` callers pass Ionicons names as `icon`. After this change `icon` is an `IconName` (Material Symbols). Grep `PrimaryButton` usages and update any `icon=` prop to the Material Symbols equivalent (e.g. `checkmark`→`check`, `download-outline`→`download`). This is part of this task.

- [ ] **Step 4: Verify + smoke test**

Run: `cd apps/mobile && npx tsc --noEmit` → exits 0 (fix any caller `icon=` props flagged).
Run: `npm test -- semanticSoft` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/theme/colors.ts apps/mobile/components/ui/PrimaryButton.tsx apps/mobile/lib/theme/__tests__/semanticSoft.test.ts
git commit -m "feat(mobile): semantic soft-pairs + gradient PrimaryButton variant"
```

---

### Task B2: `SectionLabel`, `SchoolBadge`, `AvatarBadge`

**Files:**
- Create: `apps/mobile/components/ui/SectionLabel.tsx`
- Create: `apps/mobile/components/ui/Identity.tsx` (`SchoolBadge` + `AvatarBadge`)
- Modify: `apps/mobile/components/ui/index.ts`

**Interfaces:**
- Produces:
  - `SectionLabel({ children, style }: { children: ReactNode; style?: TextStyle })` — 12px extrabold `foreground`, ls 0.2. Renders via `NpText`.
  - `SchoolBadge({ name, logoUrl, size }: { name: string; logoUrl?: string | null; size?: number })` — rounded-square: logo image if `logoUrl`, else initials on `c.primary`.
  - `AvatarBadge({ initials, size, ring }: { initials: string; size?: number; ring?: boolean })` — circle on `c.primary`, optional white ring.

These extract the inline hero-band chips currently duplicated in `(student)/index.tsx` (`logoChip`/`avatarCircle`). Screens will import them instead of re-implementing.

- [ ] **Step 1: Write `SectionLabel.tsx`**

```tsx
import { StyleSheet, type TextStyle, type StyleProp } from 'react-native';
import { ReactNode } from 'react';
import NpText from '../NpText';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

export function SectionLabel({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const c = useThemeColors();
  return <NpText style={[styles.label, { color: c.foreground }, style]}>{children}</NpText>;
}
const styles = StyleSheet.create({ label: { fontFamily: FONT.extrabold, fontSize: 12, letterSpacing: 0.2 } });
```

- [ ] **Step 2: Write `Identity.tsx`** (`SchoolBadge` + `AvatarBadge`)

```tsx
import { View, Text, Image, StyleSheet } from 'react-native';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

function initialsOf(name: string, max = 2): string {
  return name.trim().split(/\s+/).slice(0, max).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

export function SchoolBadge({ name, logoUrl, size = 34 }: { name: string; logoUrl?: string | null; size?: number }) {
  const c = useThemeColors();
  const r = Math.round(size * 0.3);
  if (logoUrl) {
    return (
      <View style={[styles.sq, { width: size, height: size, borderRadius: r, backgroundColor: c.surface }]}>
        <Image source={{ uri: logoUrl }} style={{ width: size * 0.7, height: size * 0.7 }} resizeMode="contain" />
      </View>
    );
  }
  return (
    <View style={[styles.sq, { width: size, height: size, borderRadius: r, backgroundColor: c.primary }]}>
      <Text style={{ fontFamily: FONT.extrabold, fontSize: size * 0.37, color: c.primaryForeground, letterSpacing: 0.5 }}>{initialsOf(name)}</Text>
    </View>
  );
}

export function AvatarBadge({ initials, size = 38, ring = false }: { initials: string; size?: number; ring?: boolean }) {
  const c = useThemeColors();
  return (
    <View style={[styles.sq, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.primary },
      ring && { borderWidth: 2, borderColor: c.surface }]}>
      <Text style={{ fontFamily: FONT.extrabold, fontSize: size * 0.37, color: c.primaryForeground }}>{initials}</Text>
    </View>
  );
}
const styles = StyleSheet.create({ sq: { alignItems: 'center', justifyContent: 'center' } });
```

- [ ] **Step 3: Export from barrel + verify**

Add to `index.ts`:
```ts
export { SectionLabel } from './SectionLabel';
export { SchoolBadge, AvatarBadge } from './Identity';
```
Run: `cd apps/mobile && npx tsc --noEmit` → exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/ui/SectionLabel.tsx apps/mobile/components/ui/Identity.tsx apps/mobile/components/ui/index.ts
git commit -m "feat(mobile): SectionLabel + SchoolBadge/AvatarBadge primitives"
```

---

### Task B3: `FeatureTile` + `StatTile` + `SegmentedPills`

**Files:**
- Create: `apps/mobile/components/ui/FeatureTile.tsx`
- Create: `apps/mobile/components/ui/StatTile.tsx`
- Create: `apps/mobile/components/ui/SegmentedPills.tsx`
- Modify: `apps/mobile/components/ui/index.ts`

**Interfaces:**
- Produces:
  - `FeatureTile({ icon, label, tint, onPress }: { icon: IconName; label: string; tint?: { bg: string; fg: string }; onPress: () => void })` — white `Card`-style tile, icon chip (`tint.bg`/`tint.fg`, defaults `brandSurface`/`primary`), label. 3-per-row (width `'30.3%'`).
  - `FeatureButton({ icon, count, label, tone, onPress })` — the homework/notice mini count button; `tone` keys `SEMANTIC_SOFT`.
  - `StatTile({ value, label, tone }: { value: string | number; label: string; tone: keyof typeof SEMANTIC_SOFT })` — tinted value+label tile (attendance 4-up).
  - `SegmentedPills<T>({ items, value, onChange, scroll }: { items: { key: T; label: string }[]; value: T; onChange: (k: T) => void; scroll?: boolean })` — pill selector; `scroll` renders a horizontal ScrollView (month pills).

- [ ] **Step 1: Write `FeatureTile.tsx`** (`FeatureTile` + `FeatureButton`)

```tsx
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import NpText from '../NpText';
import { Icon, type IconName } from './Icon';
import { CARD_SHADOW } from './Card';
import { useThemeColors, SEMANTIC_SOFT } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

export function FeatureTile({ icon, label, tint, onPress }: {
  icon: IconName; label: string; tint?: { bg: string; fg: string }; onPress: () => void;
}) {
  const c = useThemeColors();
  const bg = tint?.bg ?? c.brandSurface;
  const fg = tint?.fg ?? c.primary;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={[styles.tile, { backgroundColor: c.surface }, CARD_SHADOW]}>
      <View style={[styles.chip, { backgroundColor: bg }]}><Icon name={icon} size={23} color={fg} /></View>
      <NpText style={[styles.tileLabel, { color: c.foreground }]}>{label}</NpText>
    </TouchableOpacity>
  );
}

export function FeatureButton({ icon, count, label, tone, onPress }: {
  icon: IconName; count: number; label: string; tone: keyof typeof SEMANTIC_SOFT; onPress: () => void;
}) {
  const c = useThemeColors();
  const s = SEMANTIC_SOFT[tone];
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.fbtn, { backgroundColor: s.bg }]}>
      <Icon name={icon} size={22} color={s.fg} />
      <View>
        <NpText style={[styles.fbtnCount, { color: s.fgDeep }]}>{count}</NpText>
        <NpText style={[styles.fbtnLabel, { color: s.fgDeep }]}>{label}</NpText>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: { width: '30.3%', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', gap: 8 },
  chip: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontFamily: FONT.bold, fontSize: 11, textAlign: 'center' },
  fbtn: { flex: 1, borderRadius: 14, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 9 },
  fbtnCount: { fontFamily: FONT.extrabold, fontSize: 16, lineHeight: 18 },
  fbtnLabel: { fontFamily: FONT.bold, fontSize: 9.5, marginTop: 2 },
});
```

- [ ] **Step 2: Write `StatTile.tsx`**

```tsx
import { View, StyleSheet } from 'react-native';
import NpText from '../NpText';
import { SEMANTIC_SOFT } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

export function StatTile({ value, label, tone }: { value: string | number; label: string; tone: keyof typeof SEMANTIC_SOFT }) {
  const s = SEMANTIC_SOFT[tone];
  return (
    <View style={[styles.tile, { backgroundColor: s.bg }]}>
      <NpText style={[styles.value, { color: s.fg }]}>{value}</NpText>
      <NpText style={[styles.label, { color: s.fg }]}>{label}</NpText>
    </View>
  );
}
const styles = StyleSheet.create({
  tile: { flex: 1, borderRadius: 13, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center' },
  value: { fontFamily: FONT.extrabold, fontSize: 19, lineHeight: 20 },
  label: { fontFamily: FONT.extrabold, fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 3 },
});
```

- [ ] **Step 3: Write `SegmentedPills.tsx`**

```tsx
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import NpText from '../NpText';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

export function SegmentedPills<T extends string | number>({ items, value, onChange, scroll = false }: {
  items: { key: T; label: string }[]; value: T; onChange: (k: T) => void; scroll?: boolean;
}) {
  const c = useThemeColors();
  const pill = (it: { key: T; label: string }) => {
    const active = it.key === value;
    return (
      <TouchableOpacity key={String(it.key)} onPress={() => onChange(it.key)} activeOpacity={0.8}
        style={[styles.pill, scroll && styles.pillScroll,
          { backgroundColor: active ? c.primary : c.surface, borderColor: c.border, borderWidth: active ? 0 : 1 }]}>
        <NpText style={[styles.pillText, { color: active ? c.primaryForeground : c.mutedForeground }]}>{it.label}</NpText>
      </TouchableOpacity>
    );
  };
  if (scroll) return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>{items.map(pill)}</ScrollView>;
  return <View style={styles.row}>{items.map(pill)}</View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  scrollRow: { flexDirection: 'row', gap: 6, paddingRight: 12 },
  pill: { flex: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center' },
  pillScroll: { flex: 0, paddingHorizontal: 13, borderRadius: 10 },
  pillText: { fontFamily: FONT.extrabold, fontSize: 11 },
});
```

- [ ] **Step 4: Export + verify**

Add to `index.ts`:
```ts
export { FeatureTile, FeatureButton } from './FeatureTile';
export { StatTile } from './StatTile';
export { SegmentedPills } from './SegmentedPills';
```
Run: `cd apps/mobile && npx tsc --noEmit` → exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/ui/FeatureTile.tsx apps/mobile/components/ui/StatTile.tsx apps/mobile/components/ui/SegmentedPills.tsx apps/mobile/components/ui/index.ts
git commit -m "feat(mobile): FeatureTile/FeatureButton, StatTile, SegmentedPills"
```

---

### Task B4: Restyle the Student tab bar (Material Symbols + active pill)

**Files:**
- Modify: `apps/mobile/app/(student)/_layout.tsx`

**Interfaces:**
- Consumes: `Icon` (A2).

Replace the `Ionicons`-based `TabIcon` with the `Icon` component and the design's active-pill treatment (active tab: icon in a `brandSurface` pill; filled prop passed for the fast-follow). Map: Home→`school`? No — Home uses `home`? Material Symbols has no `home-outline`; use `dashboard`? The design's student tabs are Dashboard + Attendance (2 tabs, per the current `_layout` there are 5: Home/Attendance/Routine/Notices/Profile). Keep the current 5 tabs; map icons: Home→`school` is wrong — use `groups`? Pick semantically: Home→`dashboard`? Material Symbols set here must be in the 43-glyph map. **Add any new tab icons to the glyphmap USED list in Task A1 first if missing** (`dashboard` is not in the 43 — instead reuse in-map icons: Home→`school`? no). Use in-map icons: Home→`calendar_month`? Conflicts with Attendance.

> **Icon budget:** the 43-glyph map does not include dedicated tab icons. Extend the `USED` set in Task A1 with the 5 tab glyphs before this task: `home`, `event_available`, `event_note`, `campaign`, `person` — regenerate the glyphmap. (Do this as Step 1 here: add names, rerun `node scripts/gen-icon-glyphmap.mjs`, re-commit glyphmap.) Then map Home→`home`, Attendance→`event_available`, Routine→`event_note`, Notices→`campaign`, Profile→`person`.

- [ ] **Step 1: Extend the glyphmap with tab icons**

Add `home event_available event_note` to the `USED` list in `scripts/gen-icon-glyphmap.mjs` and the glyphmap test's `USED` (`campaign`/`person` already present). Rerun `node scripts/gen-icon-glyphmap.mjs`; confirm no "Missing codepoints". Run `npm test -- glyphmap`.

- [ ] **Step 2: Rewrite `TabIcon` in `_layout.tsx`**

```tsx
import { Tabs } from 'expo-router';
import { View, type ColorValue } from 'react-native';
import { Icon, type IconName } from '../../components/ui';
import { useThemeColors } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';

function TabIcon({ name, color, focused }: { name: IconName; color: ColorValue; focused: boolean }) {
  const c = useThemeColors();
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 16, paddingVertical: 3, borderRadius: 11,
      backgroundColor: focused ? c.brandSurface : 'transparent' }}>
      <Icon name={name} size={22} color={color as string} fill={focused} />
    </View>
  );
}
```

Update each `<Tabs.Screen>` `tabBarIcon` to `<TabIcon name="home" ... />` etc. (no more `focused ? 'home' : 'home-outline'` — Material Symbols uses one name + `fill`). Keep `tabBarActiveTintColor: c.primary`.

- [ ] **Step 3: Verify + render check**

Run: `cd apps/mobile && npx tsc --noEmit` → exits 0.
Launch the Student app (Expo) and confirm the tab bar shows Material Symbols icons with the active pill highlight. (Foreground-buzz/fill caveat noted; visual only.)

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/(student)/_layout.tsx apps/mobile/scripts/gen-icon-glyphmap.mjs apps/mobile/lib/icons/glyphmap.ts apps/mobile/lib/icons/__tests__/glyphmap.test.ts
git commit -m "feat(mobile): restyle Student tab bar (Material Symbols + active pill)"
```

---

## Phase C — Home pilot (validation gate)

### Task C1: Add the "Today" module + migrate Home icons + per-tile tints

**Files:**
- Create: `apps/mobile/lib/nextPeriod.ts` (+ test)
- Create: `apps/mobile/lib/todayStatus.ts` (+ test)
- Create: `apps/mobile/components/ui/TodayModule.tsx`
- Modify: `apps/mobile/app/(student)/index.tsx`
- Modify: `apps/mobile/lib/i18n/locales/{en,np}/student.json` (+ `common.json` if needed)

**Interfaces:**
- Consumes: `useMyProfile`, `useMyTimetable`, `useMyAttendanceSummary` (existing), `Icon`, `FeatureTile`, `FeatureButton`, `SectionLabel`, `SchoolBadge`, `AvatarBadge`.
- Produces:
  - `nextPeriod(periods: { startTime: string; ... }[], nowMinutes: number): Period | null` — first period whose `startTime` ≥ now (Nepal minutes-since-midnight); null if none left.
  - `todayAttendanceStatus(recentHistory: { dateAd: string; status: string }[], todayAd: string): string | null` — status for today, or null if unmarked.
  - `TodayModule` — the white "Today" card: present-status row (green `check_circle` when marked present; muted when unmarked), next-class row (`schedule` icon → routine), and homework/notice `FeatureButton`s.

- [ ] **Step 1: Write `nextPeriod.ts` + failing test**

```ts
// apps/mobile/lib/nextPeriod.ts
export interface PeriodLike { periodNumber: number; startTime: string; endTime: string; subject: { name: string }; room: string | null; }

/** minutes since midnight for "HH:MM[:SS]" */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** First period starting at/after nowMinutes; null if the school day is over. */
export function nextPeriod(periods: PeriodLike[], nowMinutes: number): PeriodLike | null {
  const upcoming = periods.filter((p) => toMinutes(p.startTime) >= nowMinutes)
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  return upcoming[0] ?? null;
}
```

```ts
// apps/mobile/lib/__tests__/nextPeriod.test.ts
import { nextPeriod } from '../nextPeriod';
const P = (n: number, start: string) => ({ periodNumber: n, startTime: start, endTime: start, subject: { name: `S${n}` }, room: null });

it('returns the next upcoming period', () => {
  const periods = [P(1, '08:00'), P(2, '10:45'), P(3, '13:00')];
  expect(nextPeriod(periods, 9 * 60)?.startTime).toBe('10:45');
});
it('returns null after the last period', () => {
  expect(nextPeriod([P(1, '08:00')], 20 * 60)).toBeNull();
});
it('includes a period starting exactly now', () => {
  expect(nextPeriod([P(2, '10:45')], toMin('10:45'))?.periodNumber).toBe(2);
});
function toMin(s: string) { const [h, m] = s.split(':').map(Number); return h * 60 + m; }
```

Run: `cd apps/mobile && npm test -- nextPeriod` → PASS (3).

- [ ] **Step 2: Write `todayStatus.ts` + test**

```ts
// apps/mobile/lib/todayStatus.ts
export function todayAttendanceStatus(
  recentHistory: { dateAd: string; status: string }[],
  todayAd: string,
): string | null {
  return recentHistory.find((h) => h.dateAd === todayAd)?.status ?? null;
}
```

```ts
// apps/mobile/lib/__tests__/todayStatus.test.ts
import { todayAttendanceStatus } from '../todayStatus';
it('finds today status', () => {
  expect(todayAttendanceStatus([{ dateAd: '2026-07-13', status: 'PRESENT' }], '2026-07-13')).toBe('PRESENT');
});
it('null when unmarked', () => {
  expect(todayAttendanceStatus([{ dateAd: '2026-07-12', status: 'PRESENT' }], '2026-07-13')).toBeNull();
});
```

Run: `npm test -- todayStatus` → PASS (2).

- [ ] **Step 3: Write `TodayModule.tsx`**

Compose a white `Card` with: a header row (`SectionLabel` "Today" + today BS pill), the present-status row (`check_circle` filled + `SEMANTIC_SOFT.success` when `status==='PRESENT'`; `SEMANTIC_SOFT.neutral` + "Not yet marked" when null; `SEMANTIC_SOFT.danger` when ABSENT), a next-class `TouchableOpacity` row (`schedule` icon chip `SEMANTIC_SOFT.info`, "Next class · {startTime}" + subject·room, chevron) shown only when `nextPeriod` is non-null, and a two-up row of `FeatureButton`s (homework `assignment_late`/`warning`, notice `campaign`/`danger`). Props: `{ status: string | null; next: PeriodLike | null; homeworkCount: number; noticeCount: number; todayBsLabel: string; onNext(); onHomework(); onNotices() }`. All copy via `t()`. Use design values: card radius 20, inner rows radius 14, gaps 9.

- [ ] **Step 4: Wire into `index.tsx`**

In `(student)/index.tsx`: (a) replace the Ionicons imports with `Icon` + the new primitives; (b) migrate the Quick-access grid to `FeatureTile` with **per-tile tints** (Attendance→success, Routine→info, Results→warning, Assignments→info, Notices→danger, Profile→neutral — using `SEMANTIC_SOFT`); (c) migrate the hero-band chips to `SchoolBadge`/`AvatarBadge`/`SectionLabel`; (d) insert `<TodayModule .../>` as the first body element (compute `next` via `nextPeriod(tt.periods, nepalNowMinutes)`, `status` via `todayAttendanceStatus(s.recentHistory, todayInNepalAd)`, `homeworkCount`/`noticeCount` from existing hooks or 0-fallback); (e) keep `AttendanceSummaryCard` below the Today module OR remove per the design (design shows Today module in place of the big summary — **remove `AttendanceSummaryCard` from Home**, it remains on the Attendance tab). Map the "Routine →" link chevron to `Icon name="chevron_right"`.

> Nepal now-minutes: `const n = new Date(Date.now() + 345*60*1000); const nowMin = n.getUTCHours()*60 + n.getUTCMinutes();`

- [ ] **Step 5: Add i18n keys**

Add to `student.json` (en + np): `today.title`, `today.markedPresent`, `today.markedAbsent`, `today.notMarked`, `today.nextClass` (with `{{time}}`), `today.homeworkDue`, `today.newNotice` (+ plurals). Reuse `common.today`. Put the np values into the I18N-1 review doc.

- [ ] **Step 6: Verify + validation gate**

Run: `cd apps/mobile && npx tsc --noEmit` → exits 0. `npm test` → green.
**VALIDATION GATE:** launch the Student app, compare Home against the design's Student HOME frame (design canvas). Confirm: hero band, Today module (present + next-class + 2 buttons), 6 tinted feature tiles, Today's classes. Run once with the maroon demo `--primary` and once default green — both re-tint correctly.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/lib/nextPeriod.ts apps/mobile/lib/todayStatus.ts apps/mobile/lib/__tests__/nextPeriod.test.ts apps/mobile/lib/__tests__/todayStatus.test.ts apps/mobile/components/ui/TodayModule.tsx apps/mobile/components/ui/index.ts apps/mobile/app/(student)/index.tsx apps/mobile/lib/i18n/locales/en/student.json apps/mobile/lib/i18n/locales/np/student.json
git commit -m "feat(mobile): Student Home — Today module + Material Symbols + tinted tiles"
```

---

## Phase D — Results (richest screen)

### Task D1: Results-derivation helpers (TDD)

**Files:**
- Create: `apps/mobile/lib/results.ts` (+ test)

**Interfaces:**
- Produces (pure, from data the existing `me/results` + `me/report-card` endpoints already return — see spec §5 verification table):
  - `gpaTrend(terms: { name: string; gpa: number | null }[]): { label: string; gpa: number }[]` — published terms in order, dropping null-GPA terms.
  - `gpaChange(terms: { gpa: number | null }[], index: number): number | null` — selected term GPA minus previous term GPA; null if <2 or missing.
  - `rankChange(terms: { rankInClass: number | null }[], index: number): number | null` — previous rank minus selected (positive = improved); null if missing.
  - `subjectInsights(subjects: { subjectName: string; percentage: number | null }[]): { top: Subject | null; focus: Subject | null }` — max/min by percentage.

- [ ] **Step 1: Write `results.ts` with the four helpers** (complete implementations)

```ts
// apps/mobile/lib/results.ts
export interface TermLite { name: string; gpa: number | null; rankInClass: number | null; }
export interface SubjectLite { subjectName: string; percentage: number | null; marksObtained: number | null; fullMarks: number; grade: string | null; }

export function gpaTrend(terms: { name: string; gpa: number | null }[]): { label: string; gpa: number }[] {
  return terms.filter((t): t is { name: string; gpa: number } => t.gpa != null).map((t) => ({ label: t.name, gpa: t.gpa }));
}
export function gpaChange(terms: { gpa: number | null }[], index: number): number | null {
  if (index <= 0) return null;
  const cur = terms[index]?.gpa, prev = terms[index - 1]?.gpa;
  return cur != null && prev != null ? Math.round((cur - prev) * 100) / 100 : null;
}
export function rankChange(terms: { rankInClass: number | null }[], index: number): number | null {
  if (index <= 0) return null;
  const cur = terms[index]?.rankInClass, prev = terms[index - 1]?.rankInClass;
  return cur != null && prev != null ? prev - cur : null;
}
export function subjectInsights(subjects: SubjectLite[]): { top: SubjectLite | null; focus: SubjectLite | null } {
  const graded = subjects.filter((s) => s.percentage != null);
  if (!graded.length) return { top: null, focus: null };
  const sorted = [...graded].sort((a, b) => (b.percentage as number) - (a.percentage as number));
  return { top: sorted[0], focus: sorted[sorted.length - 1] };
}
```

- [ ] **Step 2: Write the tests**

```ts
// apps/mobile/lib/__tests__/results.test.ts
import { gpaTrend, gpaChange, rankChange, subjectInsights } from '../results';

it('gpaTrend drops null-GPA terms', () => {
  expect(gpaTrend([{ name: 'T1', gpa: 3.2 }, { name: 'T2', gpa: null }, { name: 'T3', gpa: 3.6 }]))
    .toEqual([{ label: 'T1', gpa: 3.2 }, { label: 'T3', gpa: 3.6 }]);
});
it('gpaChange diffs vs previous term', () => {
  expect(gpaChange([{ gpa: 3.2 }, { gpa: 3.6 }], 1)).toBe(0.4);
  expect(gpaChange([{ gpa: 3.2 }], 0)).toBeNull();
});
it('rankChange is positive when rank improves', () => {
  expect(rankChange([{ rankInClass: 5 }, { rankInClass: 2 }], 1)).toBe(3);
});
it('subjectInsights picks max and min by percentage', () => {
  const subs = [
    { subjectName: 'Math', percentage: 92, marksObtained: 92, fullMarks: 100, grade: 'A+' },
    { subjectName: 'Eng', percentage: 55, marksObtained: 55, fullMarks: 100, grade: 'C' },
  ];
  const r = subjectInsights(subs);
  expect(r.top?.subjectName).toBe('Math');
  expect(r.focus?.subjectName).toBe('Eng');
});
```

Run: `cd apps/mobile && npm test -- results` → PASS (4).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/results.ts apps/mobile/lib/__tests__/results.test.ts
git commit -m "feat(mobile): Results derivation helpers (trend/change/insights)"
```

---

### Task D2: Results components — `ResultHero`, `GpaTrendBars`, `InsightCard`, `SubjectRow`

**Files:**
- Create: `apps/mobile/components/ui/ResultHero.tsx`
- Create: `apps/mobile/components/ui/GpaTrendBars.tsx`
- Create: `apps/mobile/components/ui/InsightCard.tsx`
- Create: `apps/mobile/components/ui/SubjectRow.tsx`
- Modify: `apps/mobile/components/ui/index.ts`

**Interfaces:**
- Produces:
  - `ResultHero({ gpa, pct, grade, rank, gpaChange, rankChange })` — gradient card (`headerGradient(c.primary)`), GPA + aggregate% left, grade + "Rank #{rank}" right, optional change strip (shown only when `gpaChange`/`rankChange` non-null). **No "of Y"** (rank total unavailable — spec §5).
  - `GpaTrendBars({ data }: { data: { label: string; gpa: number }[] })` — mini bar chart; render nothing when `data.length < 2`.
  - `InsightCard({ tone, label, subject, detail })` — the top-subject/needs-focus tile.
  - `SubjectRow({ name, obtained, fullMarks, grade })` — subject name + obtained/full + grade chip + plain progress bar (`obtained/fullMarks`). **No class-avg marker** (unavailable — spec §5).

- [ ] **Step 1: Write the four components**

Use the design's exact values (spec §3 + Results frame). `ResultHero`: radius 20, padding 18, white text, `F0CBD1`-style muted computed as `deriveOnPrimary(c.primary).pale` (do NOT hardcode the maroon-specific `#F0CBD1` — derive it so it works per-school). Grade chip / progress fill use the grade's semantic tone via a small local `gradeTone(grade)` (A/A+→success, B→info, C→warning, D/E/F→danger) using `SEMANTIC_SOFT`. `GpaTrendBars`: bars heights scaled to max 4.0 GPA, height 88, label + value per bar.

(Provide the full JSX per component following the primitives already built. Each is a pure presentational component; no data fetching.)

- [ ] **Step 2: Export + verify**

Add exports to `index.ts`. Run `npx tsc --noEmit` → exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/ui/ResultHero.tsx apps/mobile/components/ui/GpaTrendBars.tsx apps/mobile/components/ui/InsightCard.tsx apps/mobile/components/ui/SubjectRow.tsx apps/mobile/components/ui/index.ts
git commit -m "feat(mobile): Results components (hero, trend bars, insights, subject row)"
```

---

### Task D3: Refactor `(student)/results.tsx`

**Files:**
- Modify: `apps/mobile/app/(student)/results.tsx`
- Modify: `apps/mobile/lib/i18n/locales/{en,np}/student.json`

- [ ] **Step 1: Read the current screen + its hooks**

Read `app/(student)/results.tsx` to learn the hooks it already imports (`useMyResults`/`useMyReportCard` or equivalent) and its current data shape. If the report-card hook doesn't already return `subjects[]`, confirm the `me/report-card` endpoint provides it (it does — spec §5) and extend the hook's typing only (no API change).

- [ ] **Step 2: Rebuild the screen body**

`bar` `ScreenHeader` (back + "Exam results" + academic year) → term `SegmentedPills` (from the results list) → `ResultHero` (selected term; `gpaChange`/`rankChange` via `lib/results`) → `GpaTrendBars` (from `gpaTrend`, hidden when <2 terms) → two `InsightCard`s (from `subjectInsights`) → `SubjectRow` list (report-card subjects) → Marksheet/PDF button (existing download hook). Empty/error via `StateViews`. All icons via `Icon`; all copy via `t()`.

- [ ] **Step 3: i18n + verify + render check**

Add result keys to `student.json` (en/np + review doc). Run `npx tsc --noEmit` → 0; `npm test` → green. Render check against the design Results frame: hero, trend (with ≥2 published terms), insights, breakdown. Confirm a single-published-term account hides the trend/change gracefully.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/(student)/results.tsx apps/mobile/lib/i18n/locales/en/student.json apps/mobile/lib/i18n/locales/np/student.json
git commit -m "feat(mobile): Student Results screen redesign"
```

---

## Phase E — Remaining Student screens (delta refactors)

Each screen already exists and is token-driven. The pattern for every task below: **(1) read the current screen; (2) swap `Ionicons`→`Icon` (add any missing glyph names to the Task A1 `USED` set + regenerate + retest before use); (3) apply the specific design deltas listed; (4) route copy through `t()`; (5) `npx tsc --noEmit` exits 0 + `npm test` green + render-check against the matching design frame; (6) commit.** Use only existing hooks/data.

### Task E1: Attendance (`attendance.tsx`)
- Deltas: `hero` header (title, class, month) + year `SegmentedPills` + horizontal month `SegmentedPills(scroll)` + a 4-up `StatTile` row (present/absent/late/leave, tones success/danger/warning/info) + present-rate line + restyled `AttendanceCalendar` (rounded tinted cells, today ring, Saturday column via `SATURDAY_HIGHLIGHT`) + "Recent activity" list. Future-month → `event_upcoming` empty state.
- The calendar component is shared (`AttendanceCalendar`) — restyle its cell look additively (keep its `statusConfig` prop API) so Parent/Teacher inherit the improvement.
- Commit: `feat(mobile): Student Attendance screen redesign`.

### Task E2: Routine (`timetable.tsx`)
- Deltas: `hero` header + Sun–Fri day filter (reuse the parent day-selector pattern / build `DayFilter` if not shared) + period timeline (time gutter + period cards with subject-tinted icon chip via `subjectColor`, teacher/room rows using `person`/`meeting_room` icons, **NOW** badge when a period is current in Nepal time, lunch-break rows with `restaurant`). Reuse/extend `SubjectSlot` where it fits.
- Commit: `feat(mobile): Student Routine screen redesign`.

### Task E3: Notices (`notices.tsx`)
- Deltas: `bar`/`plain` header + left-accent notice cards (tag chip in a tone tint, date, title, body). Extend the shared `NoticeFeed` additively (left-accent border + tag chip) so Parent/Teacher inherit it.
- Commit: `feat(mobile): Student Notices screen redesign`.

### Task E4: Profile + Settings + Edit (`profile.tsx`, `profile-details.tsx`)
- Deltas: tinted `hero` header (settings gear `settings` → opens Settings content, `SchoolBadge`, `AvatarBadge`, name, adm·class) + info `Card` of `InfoRow`s + menu `SettingsRow`s + danger sign-out (`logout`, `SEMANTIC_SOFT.danger`). Settings content (within existing routes — no new route files): `LanguageToggle`, change-password → `app/change-password.tsx`, sign-out, `v1.0.0`. Edit: read-only fields with `lock` on managed fields ("managed by your school"). **No new write endpoints.**
- Commit: `feat(mobile): Student Profile/Settings/Edit redesign`.

### Task E5: Assignments + detail (`assignments.tsx`, `assignment-detail.tsx`)
- Deltas: `bar` header ("n pending · n submitted") + tinted assignment cards (`menu_book` chip in subject tone, status chip via existing `lib/assignmentStatus`, title, due). Detail: restyle with new primitives; **submit/resubmit + upload flow unchanged** (EDU-2 `lib/submissionUpload`, 409 "Submission locked" branch, after-review/closed states). Icons → `Icon`.
- Commit: `feat(mobile): Student Assignments + detail redesign`.

### Task E6: Inbox (`inbox.tsx`)
- Deltas: restyle shared `NotificationInbox` additively (new card look, `Icon` glyphs, BS timestamps) — mark-read on open + mark-all preserved. Shared component → Parent/Teacher inherit it.
- Commit: `feat(mobile): Notification inbox restyle`.

---

## Phase F — Verification & i18n sweep

### Task F1: Ionicons audit + full type/test pass
- [ ] **Step 1:** Grep for remaining Ionicons in Student surfaces: `grep -rn "Ionicons" apps/mobile/app/(student) apps/mobile/components/ui`. Every Student-reachable icon should be `Icon`. Shared components still used by not-yet-migrated Parent/Teacher may retain Ionicons — that's fine; note them.
- [ ] **Step 2:** Run `cd apps/mobile && npx tsc --noEmit` → exits 0.
- [ ] **Step 3:** Run `cd apps/mobile && npm test` → all green (existing + new: glyphmap, Icon, semanticSoft, nextPeriod, todayStatus, results).
- [ ] **Step 4:** Theming check — run the Student app under the maroon demo `--primary` and default green; confirm every new primitive (Today module, tiles, hero, tabs, buttons) re-tints and no hardcoded brand hex leaks.
- [ ] **Step 5: Commit** any fixes: `chore(mobile): icon audit + verification sweep for Student slice`.

### Task F2: I18N-1 human-review handoff
- [ ] **Step 1:** Collect every new/changed Nepali string from this slice into `docs/mobile/I18N-1-review-translations.md` (append a "Redesign Slice 1 — Student" section, two-column en→np).
- [ ] **Step 2:** Do NOT self-certify — flag for Srijan's review (per the I18N-1 gate). Note in the PR description that np copy awaits his read.
- [ ] **Step 3: Commit:** `docs(mobile): add redesign Slice 1 Nepali strings to I18N-1 review doc`.

---

## Self-Review

**Spec coverage:** Icon system (A1–A2, spec §2) ✓ · tint reuse + semantic softs (B1, spec §3) ✓ · shared primitives incl. propagation-additive changes (B1–B3, E1/E3/E6 restyle shared components additively, spec §4) ✓ · all 10 Student screens (C1 Home, D3 Results, E1 Attendance, E2 Routine, E3 Notices, E4 Profile/Settings/Edit + Profile-details, E5 Assignments + detail, E6 Inbox, spec §5) ✓ · graceful fallbacks (C1 marked-time omitted; D2/D3 no rank-total, no class-avg; GpaTrendBars hidden <2 terms — spec §5 table) ✓ · states/i18n/theming (all screen tasks + F1/F2, spec §6) ✓ · verification (F1/F2 + per-screen render checks, spec §7) ✓ · out-of-scope respected (no apps/api diff — Global Constraints; §8) ✓.

**Placeholder scan:** Foundation + logic tasks carry complete code. Screen tasks E1–E6 are delta-refactors with enumerated concrete deltas + the design canvas as the pixel reference + explicit verification — not "add styling" vagueness. D2 Step 1 defers full JSX to the executor with exact values/derivations named (acceptable: pure presentational assembly from already-specified primitives).

**Type consistency:** `IconName` used consistently (A2 defines, B1/B4/all screens consume). `SEMANTIC_SOFT` keys (`success|warning|info|danger|neutral`) consistent across B1/B3/C1/D2. `nextPeriod`/`todayAttendanceStatus`/`gpaTrend`/`gpaChange`/`rankChange`/`subjectInsights` signatures defined in C1/D1 and consumed in C1/D3.
