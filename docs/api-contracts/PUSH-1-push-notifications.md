# PUSH-1 — Push Delivery Pipeline + Real Notification Inbox

**Save location:** `docs/api-contracts/PUSH-1-push-notifications.md`
**Scope:** apps/api (send pipeline) + apps/mobile (receive, routing, badge, inbox). Audit item P1-14: device tokens are registered but the backend never sends; the app has no receive handlers or notification→screen routing; the bell badge is a hardcoded red dot.
**Baseline:** 352 tests, all-green on main.

---

## Step 0 — Read and report
1. Device-token registration today: where mobile registers tokens, where the api stores them (table? per-tenant?), whether tokens are tied to user+device, and whether stale tokens are ever cleaned.
2. The existing in-app notifications module (Communication): what events already create in-app notification rows, what the mobile apps currently fetch/display, whether an unread-count endpoint exists, and where the hardcoded bell dot lives per role app.
3. Which domain events exist on the EventEmitter2 bus today (absence, result published, invoice, notice…) — list them; push piggybacks on these, it does not invent new ones.
4. Expo push prerequisites in this codebase: Expo SDK version, whether a dev build or Expo Go is how Srijan runs the app on a device (affects push behavior — report, and note Android needs FCM config for standalone builds, OUT OF SCOPE here; Expo Go / dev-build receipt is the target).

## T1 — Backend send pipeline (apps/api)
- `expo-server-sdk`: PushService that, given user ids + a notification payload (title, body, data.route), resolves their device tokens and sends in chunks; processes receipts; prunes tokens Expo reports as `DeviceNotRegistered` (log each prune).
- Wire into the existing event listeners (same fire-and-forget listener pattern as mail/SMS): absence marked → parent(s); result published → student + parents; invoice created/overdue → parents; notice posted → target audience. Every push mirrors an in-app notification row (single source: create the row, then push referencing it — the push's `data` carries the notification id + route).
- No new env secrets needed for Expo's service; if an access token env is supported, make it optional-Joi per the established pattern.
- Unread-count endpoint if Step 0 shows none; mark-read endpoint(s) if missing.

## T2 — Mobile receive + routing (all three role apps)
- Permission request at an appropriate moment (post-login, not app-launch nag); graceful denial.
- Foreground handler (show banner) + tap handler: `data.route` → expo-router navigation map (absence → attendance screen, result → results, invoice → fees, notice → notices; teacher app: notices per Step 0 findings — the audit says teachers lack a notices screen entirely; if trivially reusable from student/parent, include it, else route teacher notice-pushes to dashboard and note the gap).
- Bell badge: replace the hardcoded dot with the real unread count (TanStack Query, refetch on focus + on push received). Mark-read on open.
- Inbox screen: if one exists per Step 0, wire it; if not, a simple list (title, body, time in BS-aware format, unread styling, tap → route) reusing existing list patterns.

## T3 — Tests + docs
Unit: token pruning on DeviceNotRegistered, event→audience resolution (absence goes to THAT student's guardians only — object-scoping discipline), payload shape. Suite ≥352. CLAUDE.md dev-notes.

## Verification — raw output
1. Unit suite ≥352.
2. **Live device proof (Srijan, guided):** pause with instructions — he opens the parent app on his physical phone (logged into demo), session triggers a real absence-mark via HTTP for that parent's child → push arrives on the phone; Srijan confirms + taps it → lands on the attendance screen. Same for one more event type (result or notice). His confirmation is the proof; screenshots optional.
3. Token-prune proof: insert a fabricated invalid token for the test user, trigger a send, paste the prune log + read-back showing the token row removed.
4. Badge proof: unread count via API before/after mark-read (raw HTTP).
5. Scoping proof: absence for child A pushes to A's guardians only — paste the resolved audience for a crafted case with two families (clean up with read-backs).
6. Push + all-green. Cleanup of all crafted rows with read-backs.

## Out of scope
- FCM config / standalone-build push (EAS release session), notification preferences/mute settings, SMS-vs-push dedup policy, web-portal notifications, scheduled digests.
