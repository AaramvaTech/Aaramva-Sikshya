# SESSION-M3 — Student App Wiring

**Type:** Mobile frontend wiring. Connect the already-built Student app screens to the live backend with real data, respecting student-self hard-scope. **No backend code changes. No redesign. No auth-flow rebuild.**

**Source of truth:** `docs/audits/BACKEND-AUDIT-2026-06-21.md` (Student gap section) + R1 changes (`/students/me/results` and `/me/report-card` now exist; demo seed ships a provisioned parent).

**Stack (mobile):** Expo SDK 54, expo-router, NativeWind v4, React Native Reusables, TanStack Query, Zustand, Axios, expo-secure-store, MMKV. Auth = response-body tokens in expo-secure-store + `X-Client-Type: mobile` + `X-Tenant-Slug`. Theming = per-tenant `vars()` via the `useThemeColors` bridge. Dates via `BsDate` (BS display / AD storage); Devanagari via `NpText`.

---

## Hard rules

1. **Step 0 reconciliation gate runs first.** Do not wire any screen until the gate passes.
2. **No backend code changes.** If a screen needs an endpoint that is MISSING or BROKEN, **STOP and report it** for a separate backend session. Do not add it here. Do not wire a screen to a 404.
3. **No redesign / no restructuring** of the built UI. Bind data into existing screens only. Navigation, the theming engine, and the working auth flow are off-limits except to *consume* the token/tenant they already manage.
4. **Hard-scope is server-enforced.** The student only ever sees their own data. The client calls the self-scoped `/me` endpoints and must **never construct or accept another student's id**. No client-supplied id params for student-owned data.
5. **Response-shape discipline.** Paginated = `.data.data.data`; simple = `.data.data`. Audit the actual response per endpoint — do not assume the depth.
6. **Every wired screen handles loading / error / empty**, and supports pull-to-refresh where it shows a list or refreshable data.
7. **BS dates render via `BsDate`**, and any visible BS value is verified against an authoritative Nepali calendar (hamropatro) — never trust a computed day-of-week unchecked.

---

## Step 0 — Reconciliation gate (no wiring yet)

- Enumerate the Student app's actual screens/routes as built (the expo-router tree).
- For each screen, identify the exact self-scoped backend endpoint(s) it must call, cross-referencing the audit's Student section and the live controllers. Produce a table:

  | Screen | Endpoint(s) | Method | Response shape (`.data.data` / `.data.data.data`) | Audit status (WORKING / BROKEN / MISSING) |

- Confirm a **demo student login** exists in the demo tenant. The seed provisions the parent; it may not ship a student account. If none exists, ensure one via the existing student-account path (data setup only — no code change) and record the credentials for the walk-through.
- **GATE:** if every screen maps to a WORKING self-scoped endpoint, report the table and proceed. If any is MISSING or BROKEN, **STOP**, name the screen + endpoint, recommend a backend session, and wire nothing.

---

## Wiring tasks (per screen, in the order Step 0 lists them)

For each screen:

- Replace placeholder/mock data with a **TanStack Query** hook hitting the endpoint through the shared Axios client (which already attaches the auth token + `X-Client-Type: mobile` + `X-Tenant-Slug`).
- Parse at the correct depth (shape discipline).
- Render real data into the **existing** components; route colors through `useThemeColors`; Devanagari via `NpText`; dates via `BsDate`.
- Handle **loading** (match the existing skeleton/spinner pattern), **error** (with a retry affordance), **empty** (a clean no-data state).
- Add **pull-to-refresh** for list/refreshable screens.
- Do not alter layout or styling beyond what binding data requires.

**Likely screens — confirm against Step 0, do not assume this list:** Home/dashboard summary, Attendance (summary + history), Timetable, Results/Marks (`GET /students/me/results`), Report card (`GET /students/me/report-card`), Fees/ledger, Profile, Notices. Wire only screens that actually exist.

This session is **resumable**: wire screens in order; if context runs long, report progress and stop at a clean screen boundary — re-running continues from the next unwired screen.

---

## Not in scope

- No backend changes (halt and report if an endpoint is missing/broken).
- No redesign, no new screens, no navigation changes.
- No auth-flow or theming-engine changes.
- No parent or teacher work.

---

## Verification (mobile — manual walk-through + logs)

- Run the app against the demo tenant; log in as the demo student.
- Walk every wired screen: confirm real data renders, the shape is parsed correctly, and loading / error / empty are each reachable (e.g. kill the network to hit error/empty).
- Confirm at least one visible BS date matches hamropatro.
- Confirm there is no client path to another student's data (server enforces 403 regardless).
- **Paste:** the Step 0 screen→endpoint table, the Metro/console network-log lines for each screen's successful fetch, and a per-screen checklist (data renders / loading / error / empty / refresh). Note any screen skipped because its endpoint was missing, and one-line verdict: wired / blocked.
