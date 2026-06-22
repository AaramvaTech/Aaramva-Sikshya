# SESSION-M7 — Parent Leave-filing screen (Claude Design build)

**Type:** Mobile UI build (Claude Design). Build the screen with mock interactions; **no live POST, no backend changes** — that's M7.1. This is the parent app's first **write** screen.

**Why:** `POST /attendance/leave` is proven and hard-scoped (M4 / audit), but no UI exists for a parent to file leave for their child.

**Stack & conventions:** NativeWind v4 + React Native Reusables, token system (`useThemeColors`, per-tenant theming), `BsDate` for dates, `NpText` for Devanagari. Match the existing **parent** app's visual language. Reuse the existing **child picker** (`selectedChildId`) — leave is filed for the selected child, who must be one of the parent's own.

---

## Placement

Filing leave is an attendance action, so add the entry point on the **parent Attendance screen** — a "Request leave" button/action → navigates to this leave-filing screen. (Off-tab, reached from Attendance.)

## Fields (default set — confirm against the DTO at wire time)

- **Child** — the shared child picker; defaults to the currently selected child. The form files for this child only.
- **Dates** — a **from–to range** (a single day is from == to), chosen via the app's BS calendar / `BsDate` picker. Display BS, store AD (the existing convention).
- **Reason** — multiline text input (`NpText`-capable for Devanagari).
- **Submit** — primary button.

**Note for the wiring session (M7.1):** confirm the real `POST /attendance/leave` request DTO first. If it carries a **leave type/category** or requires a single date rather than a range, adjust the form to match — build to this default now, and M7.1's Step 0 reconciles it. (No attachment field unless the DTO has one.)

## Behavior / validation (mock now, wire later)

- Submit disabled until: a child is selected, dates are valid (to ≥ from), and reason is non-empty.
- **Submitting:** button shows a spinner / disabled state.
- **Success:** a clear confirmation (toast or inline success), then reset the form.
- **Error:** inline error with the message and a retry.

If a parent-facing **leave history / status** GET exists (confirm at wire time), show the child's recent requests with status below the form; if none exists, the screen is the form alone — don't invent an endpoint.

## States

Loading (if a history list is shown), error+retry, empty ("No leave requests yet") for the history section if present.

## Avoid the known defects

Legible contrast throughout; dates via `BsDate` (verified against an authoritative BS source at wire time); no raw `Date` strings; colors via the token system.

## Out of scope

No live POST, no API calls, no backend. Mock the submit. No changes to other parent screens beyond the Attendance entry point.
