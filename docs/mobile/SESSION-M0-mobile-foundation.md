# Session M0 — Mobile Foundation

**App:** Aaramva Shikshya mobile (React Native + Expo)
**Goal:** Stand up the Expo project with the design-token system, the per-tenant theming engine, typography (Latin + Devanagari), and the folder structure that every later session builds on. No screens yet — this is the chassis.

This session is paired with a learning note at the end. Build with Claude Code, review back here.

---

## 0. Prerequisites (do these first)

These are backend / contract touch-points the mobile app depends on. Confirm them before scaffolding.

1. **Mobile auth returns the token in the body.** The web app uses an httpOnly cookie for the JWT. React Native has no cookie jar and shouldn't have one. Add a mobile login path (e.g. `POST /auth/mobile/login`, or branch on an `X-Client: mobile` header) that returns `{ accessToken, refreshToken, user: { id, role, ... } }` in the response body. The app stores these in the device keychain and sends `Authorization: Bearer <accessToken>`.
2. **Public branding endpoint exists.** `GET /public/schools/:code` returns *only* non-sensitive identity, callable with no auth:
   ```json
   {
     "success": true,
     "data": {
       "slug": "greenfield",
       "name": "Greenfield Secondary School",
       "nameNp": "ग्रीनफिल्ड माध्यमिक विद्यालय",
       "logoUrl": "https://.../logo.png",
       "primaryColor": "#1D4ED8",
       "enabledModules": ["attendance", "finance", "exams", "library"]
     }
   }
   ```
   Rate-limit it and return a generic not-found for unknown codes (don't confirm which codes exist).
3. **Role is on the user object.** The login response includes `user.role` ∈ `student | teacher | parent | admin`. The app routes off this.

---

## 1. Scaffold

Use the NativeWind quick-start (Expo + NativeWind + Tailwind preconfigured), then add Expo Router:

```bash
# fresh project, preconfigured with NativeWind
npx rn-new --nativewind aaramva-mobile

# OR, if starting from create-expo-app, add Expo Router + NativeWind manually
```

Pin **NativeWind v4** (stable, production-ready). v5 is still pre-release as of mid-2026 — skip it for now; v4 already supports the CSS-variable theming we need.

Initialize **React Native Reusables** (the shadcn-of-mobile) so its components land in `components/ui/` as owned code:

```bash
npx react-native-reusables/cli@latest init
```

## 2. Dependencies

Let Claude Code resolve current versions (use Context7 MCP). Package set:

- **Styling/UI:** `nativewind`, `tailwindcss`, peers `react-native-reanimated`, `react-native-safe-area-context`
- **Navigation:** `expo-router`
- **State / data (same as web, for consistency):** `@tanstack/react-query`, `zustand`, `axios`
- **Storage:** `expo-secure-store` (tokens), `react-native-mmkv` (everything else)
- **Fonts:** `expo-font`, `@expo-google-fonts/noto-sans-devanagari` (or self-host the file)

---

## 3. Design tokens — the single source of truth

Everything in the app reads from these. The school's brand color overrides exactly one token (`--primary`) at runtime; nothing else moves. This is what keeps the UI consistent and makes per-tenant theming a one-variable swap.

Colors are stored as **space-separated RGB channels** (not hex) so NativeWind's `<alpha-value>` works.

`lib/theme/tokens.ts`
```ts
// Aaramva (platform default). Replace --primary with the real Aaramva brand color.
export const aaramvaTheme = {
  '--primary': '79 70 229',          // indigo — REPLACE with Aaramva brand
  '--primary-foreground': '255 255 255',
  '--background': '255 255 255',
  '--surface': '248 250 252',        // cards
  '--surface-muted': '241 245 249',
  '--border': '226 232 240',
  '--foreground': '15 23 42',        // primary text
  '--muted-foreground': '100 116 139',
  '--success': '22 163 74',
  '--warning': '202 138 4',
  '--danger': '220 38 38',
  '--info': '37 99 235',
} as const;

// Dark variants live in global.css under .dark — same keys, dark values.

// hex "#1D4ED8" -> "29 78 216" for runtime school override
export function hexToRgbChannels(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}
```

**Scale discipline (no custom config needed — use Tailwind's own scale, just stay on it):**
- Spacing: 4-point scale only — `p-2 p-3 p-4 p-6 p-8`. Avoid arbitrary values.
- Radius: cards `rounded-2xl`, controls `rounded-xl`, pills `rounded-full`. Pick these and don't drift.
- Type sizes: `text-sm` (captions/meta), `text-base` (body), `text-lg`/`text-xl` (titles), `text-2xl` (screen headers). Two weights: `font-normal`, `font-medium`. Avoid heavier weights — they read clunky on mobile.

`tailwind.config.js` (map tokens → utility colors)
```js
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'rgb(var(--primary) / <alpha-value>)',
        'primary-foreground': 'rgb(var(--primary-foreground) / <alpha-value>)',
        background: 'rgb(var(--background) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-muted': 'rgb(var(--surface-muted) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        'muted-foreground': 'rgb(var(--muted-foreground) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'System'],          // Latin + numerals
        deva: ['NotoSansDevanagari'],        // Nepali strings, BS dates
      },
    },
  },
};
```

`global.css` (default = Aaramva; dark variants)
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --primary: 79 70 229;
    --primary-foreground: 255 255 255;
    --background: 255 255 255;
    --surface: 248 250 252;
    --surface-muted: 241 245 249;
    --border: 226 232 240;
    --foreground: 15 23 42;
    --muted-foreground: 100 116 139;
    --success: 22 163 74;
    --warning: 202 138 4;
    --danger: 220 38 38;
    --info: 37 99 235;
  }
  .dark:root {
    --background: 17 17 19;
    --surface: 28 28 30;
    --surface-muted: 39 39 42;
    --border: 39 39 42;
    --foreground: 248 250 252;
    --muted-foreground: 148 163 184;
  }
}
```

---

## 4. Theming engine (per-tenant runtime swap)

The whole branding handoff is one mechanism: override `--primary` on a wrapping `<View>` using NativeWind's `vars()`. Everything below that view re-reads the new color automatically — no prop drilling, no re-theming of individual components.

`lib/theme/provider.tsx`
```tsx
import { createContext, useContext, useState, useMemo, ReactNode } from 'react';
import { View } from 'react-native';
import { vars } from 'nativewind';
import { hexToRgbChannels } from './tokens';

type Branding = { primaryColor?: string; logoUrl?: string; name?: string };
type Ctx = { branding: Branding | null; applySchool: (b: Branding) => void; reset: () => void };

const ThemeCtx = createContext<Ctx>(null!);
export const useBranding = () => useContext(ThemeCtx);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding | null>(null);

  const style = useMemo(() => {
    if (!branding?.primaryColor) return undefined; // Aaramva default from global.css
    return vars({ '--primary': hexToRgbChannels(branding.primaryColor) });
  }, [branding]);

  const value = useMemo(
    () => ({ branding, applySchool: setBranding, reset: () => setBranding(null) }),
    [branding]
  );

  return (
    <ThemeCtx.Provider value={value}>
      <View style={style} className="flex-1 bg-background">
        {children}
      </View>
    </ThemeCtx.Provider>
  );
}
```

Flow: code-entry screen sits on the Aaramva default (no override). When `GET /public/schools/:code` resolves, call `applySchool({ primaryColor, logoUrl, name })` → the login screen and everything after it wear the school's color. `reset()` on logout / "not your school".

---

## 5. Typography (Latin + Devanagari)

Nepali school names, guardian names, and BS dates render in Devanagari — the system font will look broken. Load both faces in the root layout:

```tsx
// in app/_layout.tsx
import { useFonts } from 'expo-font';
const [loaded] = useFonts({
  Inter: require('../assets/fonts/Inter-Variable.ttf'),
  NotoSansDevanagari: require('../assets/fonts/NotoSansDevanagari-Variable.ttf'),
});
if (!loaded) return null; // or a splash
```

Usage rule: Latin/numeric text uses `font-sans` (default); any Nepali string uses `font-deva`. Build a tiny `<NpText>` wrapper that applies `font-deva` so it's consistent, mirroring the web `<BsDate>` pattern.

---

## 6. Storage layer

`lib/storage.ts` — two stores, clear separation:
- **`expo-secure-store`** → `accessToken`, `refreshToken` only (device keychain).
- **`react-native-mmkv`** → `tenantSlug`, last-used school code, theme preference, cached branding.

This mirrors the web fix (slug persisted + sent on every request) but tokens go in the secure store instead of localStorage.

---

## 7. Folder structure

```
app/
  _layout.tsx              # ThemeProvider + QueryClientProvider + font load + auth gate
  index.tsx                # launch router: has saved slug? -> /login : /code-entry
  (auth)/
    code-entry.tsx         # M2 — Aaramva-branded
    login.tsx              # M2 — school-branded
  (student)/_layout.tsx    # M3+ tabs
  (teacher)/_layout.tsx
  (parent)/_layout.tsx
components/
  ui/                      # React Native Reusables (owned)
  NpText.tsx               # Devanagari text wrapper
lib/
  api/
    client.ts              # axios: tenant header + bearer token + 401 handling
    queries/               # TanStack hooks per module (enabled: !!slug guards)
  auth/store.ts            # zustand: user, role, isAuthenticated
  theme/
    tokens.ts
    provider.tsx
  storage.ts
  bs-date.ts               # ported from backend 2000–2100 lookup table
global.css
tailwind.config.js
metro.config.js            # withNativeWind(config, { input: './global.css' })
babel.config.js            # jsxImportSource: 'nativewind'
```

Port `bs-date.ts` from the backend utility verbatim so AD↔BS conversion is identical on both ends. (Longer term, lift it into a shared package; for now, copy it.)

---

## 8. Acceptance criteria

- App boots to a blank `bg-background` screen with fonts loaded (no font-flash).
- A test screen with `text-primary` text changes color when `applySchool({ primaryColor: '#1D4ED8' })` is called, and reverts on `reset()` — proving the runtime swap works.
- Dark mode flips background/foreground correctly via the `.dark` class.
- A Devanagari test string renders correctly in `font-deva`.
- `bs-date.ts` returns the same conversions as the backend for a few spot-check dates.

---

## Learning note (companion)

The one idea worth internalizing this session: **theming is a data problem, not a styling problem.** You're not restyling components per school — every component already reads abstract roles (`bg-primary`, `text-foreground`). The school's identity is just *data* (`primaryColor`) that overrides one variable at the top of the tree. This is the same instinct as your backend conventions (uniform response shape, money as `NUMERIC`, dates as AD): define the contract once, and every consumer obeys it for free. When M2 swaps Aaramva branding for a school's, no component knows or cares — it just re-reads `--primary`.
