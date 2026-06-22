# SESSION-M4 — Parent App Wiring

**Type:** Mobile frontend wiring. Connect the already-built Parent app screens to the live backend with real data, **hard-scoped to the parent's own children**. **No backend code changes. No redesign. No auth/theming rebuild.**

**Source of truth:**
- `docs/audits/BACKEND-AUDIT-2026-06-21.md` (Parent section — the 8 child-scoped endpoints proven to 403 across families).
- R1: guardian provisioning shipped; the demo tenant now has a real provisioned parent — **`parent@demo.school` / `Parent@123`**.
- M3 / M3.1: reuse the corrected shared helpers/components — `lib/time.ts` (no more 1970 time string), the deduped room/class label rendering, `BsDate`, `NpText`, `useThemeColors`.

**Stack (mobile):** Expo SDK 54, expo-router, NativeWind v4, React Native Reusables, TanStack Query, Zustand, Axios, expo-secure-store, MMKV. Auth = response-body tokens + `X-Client-Type: mobile` + `X-Tenant-Slug`.

---

## Hard rules

1. **Step 0 reconciliation gate runs first.** No wiring until it passes.
2. **No backend code changes.** If a screen needs an endpoint that is MISSING or BROKEN, **STOP and report** for a separate backend session. Do not add it here. Do not wire to a 404.
3. **Parent hard-scope (confidentiality).** Every child-scoped request uses a student id drawn **only** from the parent's own `/students/my-children` response — never from user input, a deep-link, or a constructed id. The server enforces 403 regardless (audit-proven); the client must never even *attempt* another family's id.
4. **Multi-child.** Fetch `my-children`; if the parent has more than one child, drive all child-scoped screens off a selected-child context (Zustand/context), using the UI's built child selector. If the built UI has **no** selector and there are multiple children, **flag it as a gap** — do not invent a redesign.
5. **Reuse the corrected shared helpers** — period times via `lib/time.ts`, room/class labels deduped (no "Room Room", no "Class Grade"), dates via `BsDate`, Devanagari via `NpText`, colors via `useThemeColors`. Do **not** re-derive any of the patterns M3.1 just fixed.
6. **Response-shape discipline.** `.data.data` vs `.data.data.data` — audit per endpoint, don't assume.
7. **Loading / error / empty + pull-to-refresh** on every read screen.
8. **Leave-filing is a WRITE.** Parent files leave for their own child: validate the form, await the POST with the selected child's id, show success + error states, and invalidate the relevant query on success.
9. **BS dates verified against hamropatro.**

---

## Step 0 — Reconciliation gate (no wiring yet)

- Enumerate the Parent app's actual screens/routes (the `apps/mobile/app/(parent)/` tree).
- For each screen, identify the parent-scoped endpoint(s) it must call, cross-referencing the audit's Parent section and the live controllers. Expected surface (confirm, don't assume): `my-children`; child attendance summary + history; child results + report-card; **fees** (fee assignments + ledger); child/section timetable; notices; **leave-filing** (write). Produce a table:

  | Screen | Endpoint(s) | Method | Response shape | Audit status (WORKING / BROKEN / MISSING) |

- Confirm the demo parent (`parent@demo.school` / `Parent@123`) resolves to ≥1 child via `my-children`. If the parent has only one child **and** the app has a multi-child selector, the switcher can't be exercised against current seed — either ensure a second child for the demo parent (data setup only, no code change) so it's demoable, or report it.
- **GATE:** if every screen maps to a WORKING parent-scoped endpoint, report the table and proceed. If any is MISSING or BROKEN, **STOP**, name the screen + endpoint, recommend a backend session, and wire nothing.

---

## Wiring tasks (in gate order)

**Child context first.** Implement/confirm child selection from `my-children`; store the selected child; every child-scoped hook keys off the selected child's id.

**Per read screen:** TanStack Query → endpoint → parse at the correct depth → render into the existing components via the shared helpers → loading / error / empty + pull-to-refresh.

**Leave-filing (write):** form → POST with the selected child's id → success/error handling → invalidate the leave query on success. The child id must be one of the parent's own.

Do not alter layout or styling beyond binding data. Resumable: wire in order, stop at a clean screen boundary if context runs long.

---

## Not in scope

- No backend changes (halt and report if an endpoint is missing/broken).
- No redesign, no new screens, no navigation changes.
- No auth-flow or theming-engine changes.
- No student or teacher work.
- Do **not** fix the D1 seed-year staleness or the backend time serialization here — those are separate.

---

## Verification (mobile — manual walk-through + logs)

- Run against the demo tenant; log in as the demo parent.
- Confirm `my-children` resolves. If multi-child, switch child and confirm **every** child-scoped screen re-scopes to the new child.
- Walk each screen: real data, correct shape, loading / error / empty each reachable, refresh works.
- **Leave-filing:** submit a request for the parent's own child → success; confirm the record was created.
- **Hard-scope:** confirm the client only ever uses own-children ids; probe a non-child id directly → server returns 403 (as the audit proved).
- Confirm reused screens show correct period times (no 1970 string) and no "Room Room" / "Class Grade" regressions.
- Confirm at least one visible BS date matches hamropatro.
- **Paste:** the Step 0 screen→endpoint table, per-screen network logs, the per-screen checklist (data / loading / error / empty / refresh), the leave-filing write result, the hard-scope probe, and the BS check. Note any screen skipped because its endpoint was missing. Verdict per screen: wired / blocked.
