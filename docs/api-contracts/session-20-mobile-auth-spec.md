# Session 20 — Mobile Scaffold + Auth Flow (Spec)

**Type:** Mobile (frontend) — `apps/mobile/`
**Status:** Built.
**Depends on:** Session 19 backend (mobile-aware auth, tenant verify, device registry).
**Goal:** Stand up the Expo app and the full auth flow: school code → tenant verify → login → secure token storage → silent refresh → session restore → logout. Role-based home tabs are placeholders.

---

## Stack (decided)

| Concern | Choice |
|---|---|
| Framework | Expo SDK 54, managed + CNG (prebuild) |
| Routing | expo-router (file-based, `app/`) |
| Styling | NativeWind v4 |
| Server state | TanStack Query v5 |
| Client state | Zustand (in-memory only) |
| HTTP | Axios + interceptors (`lib/api.ts`) |
| Secure storage | expo-secure-store |
| Dates | `packages/bs-calendar` (AD stored, BS displayed) |

## Token security model

- **Access token:** in-memory only (Zustand). Never written to disk.
- **Refresh token:** `expo-secure-store` only (iOS Keychain / Android Keystore). The mobile equivalent of httpOnly — defends the device-theft / rooted-device threat that is the mobile analogue of web XSS.
- **Tenant slug:** `expo-secure-store` (persisted so returning users skip the school-code screen).
- SecureStore holds exactly two keys: `refreshToken`, `tenantSlug`.

## Auth state machine (Zustand `store/auth.ts`)

`status: 'booting' | 'noSchool' | 'unauthed' | 'authed'`

- `booting` — cold start; reading SecureStore + attempting refresh. Splash shown; prevents the login-screen flash before refresh resolves.
- `noSchool` — no slug stored → school-code entry.
- `unauthed` — slug present, no valid session → login (slug prefilled).
- `authed` — session live → role home.

State: `{ accessToken, user, tenant, slug, status }`. Actions: `setSession`, `clearSession`, `setSlug`.

## API client (`lib/api.ts`)

- Single axios instance; **all** requests route through it.
- Request interceptor: injects `X-Client-Type: mobile` on every request, `X-Tenant-Slug` from store (SecureStore fallback during boot).
- 401 response interceptor: single-flight queue — pause concurrent requests, call `POST /auth/refresh` via a **dedicated interceptor-free call** (so a failed refresh can't recurse), store new access token (memory) + rotated refresh token (SecureStore), replay queue. Any refresh failure → `clearSession`, wipe SecureStore, route to school entry.

## Screens / flows

### School code entry — `app/index.tsx`
Input (slug, lowercased/trimmed) → `GET /tenants/verify/:slug` → show name + logo on 200 / inline "not found" on 404 → confirm persists slug, `status='unauthed'`, go to login.

### Login — `app/login.tsx`
Email + password → `POST /auth/login` (`X-Tenant-Slug`, `X-Client-Type: mobile`) → store access (memory) + user/tenant, write rotated refresh to SecureStore, `status='authed'`. Then **fire-and-forget** push registration: `Device.isDevice` check → permission → Expo token (needs dev build + EAS `projectId`; no-ops in Expo Go) → `POST /communication/devices`, all wrapped so failure never blocks login.

### Session restore (boot) — root `_layout.tsx`
`booting` → read SecureStore: no slug → `noSchool`; slug only → `unauthed`; both → `POST /auth/refresh` → success `authed`, failure `unauthed`.

### Logout
`POST /auth/logout` with refresh token, then **clear Zustand + SecureStore regardless of API result**, route to school entry.

### Role shell — `app/_layout.tsx` + role groups
`authed` renders tabs by `user.role`: `(student)`, `(parent)`, `(teacher)` groups (placeholder screens this session); admin roles → "use the web portal" screen.

## Monorepo wiring

`apps/mobile/metro.config.js`: `watchFolders` includes the monorepo root; root `node_modules` added to `nodeModulesPaths`; `withNativeWind`. Without this, `packages/bs-calendar` imports fail to resolve. A `<BsDate>` on a placeholder screen proves the import path end to end.

## Out of scope

Dashboard/attendance content (Session 22+), push handling/deep-linking (Session 24), offline, biometric, payments, iOS release.

## Acceptance

- Clean install boots to school entry; happy path school→verify→login→correct role tabs.
- Kill/relaunch restores session via refresh (no re-login); logout returns to school entry, relaunch then shows login (slug remembered).
- `BsDate` renders a correct BS date (proves Metro monorepo config).
- `npx tsc --noEmit` clean.
