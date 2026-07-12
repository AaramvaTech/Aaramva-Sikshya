# EAS-1 — EAS Setup, Android Build, and the First On-Device Push

**Save location:** `docs/mobile/EAS-1-android-build.md`
**Scope:** apps/mobile build plumbing + the descoped PUSH-1 on-device proof. Android only (iOS needs a paid Apple developer account — future). Store *submission* (listing, privacy policy, account deletion) is a later session; this one ends with a working APK on Srijan's phone receiving real push.
**Prereqs (done):** Expo account exists; Firebase project `aaramva-shikshya` exists. **Baselines:** api 511+, mobile jest 45+, all-green on main.

---

## Security rules for this session
- The Firebase **service-account JSON** is a real credential: Srijan downloads it, it gets uploaded to EAS credential storage, it must NEVER enter the repo, the chat, or any log. Gitignore its filename pattern preemptively.
- `google-services.json` is low-sensitivity but stays gitignored per repo convention; document how to regenerate it.
- All `eas login` / browser authentications are performed by Srijan himself.

## Step 0 — Read and report
1. app.json current state: name, slug, scheme, icons/splash assets present?, android package name set? (if absent, propose one: `com.aaramvatech.aaramvashikshya` — Srijan confirms before it's baked in; package names are permanent once on a store).
2. Version/build-number strategy: propose `version` + `android.versionCode` conventions + `runtimeVersion` policy for the managed workflow; report before writing.
3. The API-reachability gotcha: the phone cannot reach `localhost` — plan: `EXPO_PUBLIC_API_URL` must point at the laptop's LAN IP, the API must listen on `0.0.0.0`, and Windows Firewall must allow inbound 3001. Verify what main.ts binds today and what .env currently has; prepare exact fix steps (Srijan may need one firewall click — prepare the instruction).
4. expo-notifications config: confirm the plugin config + what `EXPO_PUBLIC_PROJECT_ID` wiring from PUSH-1 expects.

## Tasks (interleaved with Srijan's guided moments — pause at each 🧑)
T1 — 🧑 `eas login` (Srijan runs it, in his own terminal). Then `eas init` linking the repo to his account → project ID captured → `EXPO_PUBLIC_PROJECT_ID` into the mobile env + documented.
T2 — `eas.json`: three profiles — `development` (dev client, internal), `preview` (installable APK, internal distribution — **this session's target**), `production` (AAB, store — configured but unused today). Sensible env wiring per profile.
T3 — 🧑 Firebase console, guided step-by-step: add an **Android app** to the project with the confirmed package name → download `google-services.json` → place per instruction (gitignored). Then Project Settings → Service accounts → generate the **service-account key JSON** → `eas credentials` upload for FCM V1 → local JSON deleted after upload, confirmed.
T4 — Build: `eas build --platform android --profile preview` (cloud build; free-tier queue can take a while — report the build URL so progress is watchable). While it builds: land the config commits (PR per standing rule).
T5 — 🧑 Install + live proof: Srijan downloads the APK from the build page onto his phone (link/QR), installs (allowing unknown-source install — guide it), opens the app, logs into the demo school as the parent, **allows notifications**. Session verifies the device token registered (SELECT read-back — the first real device token in the platform's history). Then: trigger a real absence for that parent's child via HTTP → **the phone buzzes** → Srijan confirms + taps → lands on attendance. Repeat once with a notice event.
T6 — Docs: build-and-release runbook section (how to cut a preview APK, how versionCode bumps, the LAN-IP dev-API note, FCM credential rotation), CLAUDE.md dev-notes, store-submission checklist parked as a future-session list (privacy policy, data-safety form, account deletion — audit item 16 remainder).

## Verification — raw
1. Build page: finished build with artifact (URL + fingerprint pasted).
2. Token read-back: the device_tokens row (platform ANDROID) post-login.
3. 🧑 Push receipt ×2 (absence, notice): Srijan's confirmation + tap-routing to the right screens — the PUSH-1 descoped proof, finally closed.
4. Prune sanity: Expo receipts show delivered (no DeviceNotRegistered on a real token).
5. Suites unchanged/green, push + all-green, PR merged-by-Srijan per standing rule. Crafted absence/notice rows cleaned with read-backs.

## Out of scope
iOS, store submission/listing assets, privacy policy authoring, production AAB signing ceremony, OTA updates (expo-updates) policy — each parked with a note.
