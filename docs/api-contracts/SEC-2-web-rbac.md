# SEC-2 — Web Role-Based Access Control

**Save location:** `docs/api-contracts/SEC-2-web-rbac.md`
**Scope:** apps/web only. No backend changes, no mobile.
**Source:** Audit item P0-3 — school-shell.tsx:33 only checks token existence; no middleware.ts; every authenticated role sees the full sidebar including Finance, HR, Payroll.

---

## Architectural constraint (read first)

The web app holds the access token **in memory only** (Zustand); the JWT role claim is not available to Next.js middleware. Middleware therefore handles only **authenticated vs. unauthenticated** (via refresh-cookie presence). **Role** gating is client-side, driven by one shared config, with the backend's RBAC remaining the actual security boundary. The web-side gating is UX + defense-in-depth, and the spec must not claim otherwise in comments.

## Step 0 — Read and report BEFORE any edits

1. `apps/web/src/components/school-shell.tsx` (or actual path) — the existing token-presence check at ~line 33, and how the sidebar nav items are defined.
2. The auth Zustand store — where the user's role lands after login/refresh, and its exact type (must match the backend's 9-role enum).
3. The axios interceptor + refresh flow — confirm refresh token is an httpOnly cookie and its cookie name.
4. The App Router layout structure — route groups, where the school shell wraps pages, whether a `middleware.ts` exists (audit says no — confirm).
5. The super-admin portal routes — how they're separated from school routes.
6. The typed API contract — confirm the role enum values verbatim.

Report findings with paths/lines before editing. Stop and flag material deviations.

## Task 1 — Single source of truth: route access map

Create `apps/web/src/lib/route-access.ts`:

- Export a `ROUTE_ACCESS` structure mapping route prefixes to allowed roles, e.g.:
  - `/dashboard` → all school roles
  - `/students`, `/academic` → OWNER, PRINCIPAL, ADMIN (+ TEACHER read contexts if the app currently allows — mirror **backend** controller guards, do not invent policy; Step 0 should extract the backend's actual per-module role lists from the typed contract or controllers if visible, otherwise from the audit doc)
  - `/finance`, `/payroll` → OWNER, PRINCIPAL, ACCOUNTANT
  - `/hr` → OWNER, PRINCIPAL, ADMIN
  - `/communication`, `/library`, `/examination`, `/attendance`, `/settings` → per backend guards
- Export helpers: `canAccess(role, pathname)` and `allowedNavItems(role)`.
- **The backend's decorators are the authority.** If the backend permits a role on a module, the web map must too. Where genuinely ambiguous, match the backend exactly and add a `// TODO(policy)` comment rather than guessing stricter.

## Task 2 — middleware.ts (auth-only edge guard)

Create `apps/web/middleware.ts`:

- If request path is a protected route (everything except `/login`, `/register`, public assets, `/_next`, api routes) and the refresh cookie is **absent** → redirect to `/login?next=<path>`.
- If path is `/login` and refresh cookie **present** → redirect to `/dashboard`.
- Cookie presence only — do not attempt to decode or verify the token in middleware. Add a comment stating why (no verifiable role claim client-side; backend enforces RBAC).
- Correct `matcher` config so static assets aren't intercepted.

## Task 3 — Role gate in the shell

- In the school shell: after auth hydration, if `!canAccess(role, pathname)` → render a proper 403 screen ("You don't have access to this section") with a link back to `/dashboard`. Do not silently redirect — silent redirects hide misconfigured maps.
- Handle the hydration window: while role is still unknown (refresh in flight), render the existing loading state — never flash the 403.

## Task 4 — Role-filtered sidebar

- Sidebar renders from `allowedNavItems(role)` — an accountant sees Finance/Dashboard/their-relevant items only; a teacher no longer sees Finance/HR/Payroll.
- Verify the accountant-permissions fix from the earlier web-verification session still holds (no regression).

## Task 5 — Super-admin separation

- Ensure school-role users can never render the super-admin shell and vice versa (PLATFORM_ADMIN hitting school routes → 403 or redirect to the super-admin dashboard; confirm current behavior in Step 0 and close any gap).

---

## Verification — raw output required

1. `npx tsc --noEmit` (web app) — raw output.
2. Web test suite if present — raw output; otherwise state explicitly that no web test runner exists.
3. **Live role proofs** against the running dev stack, using demo-seed credentials, one per role at minimum:
   - Log in as **teacher** → paste the rendered sidebar item list (from a DOM dump or a small script hitting the page — a screenshotless textual proof is fine, e.g. logging `allowedNavItems(role)` plus manually navigating to `/finance` and pasting the 403 screen's text from the HTML response/DOM).
   - Log in as **accountant** → show Finance accessible, HR blocked (403 text).
   - Log in as **owner** → show full nav unchanged.
4. **Middleware proof:** `curl -sI` a protected route with no cookies → paste the 3xx redirect to `/login`. Then with a valid refresh cookie → 200.
5. **Backend parity check:** for each module in ROUTE_ACCESS, paste a two-column list (web roles vs backend controller roles) demonstrating they match. Any mismatch must be resolved toward the backend or explicitly flagged.

## Out of scope

- Any backend change (if a backend guard looks wrong, flag it — do not fix here).
- Error boundaries for failed GETs (audit P2 item 18) — separate session.
- Mobile.
