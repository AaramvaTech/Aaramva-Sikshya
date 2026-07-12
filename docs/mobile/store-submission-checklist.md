# Play Store submission checklist (parked — future session)

EAS-1 delivered an installable **preview APK** (internal distribution) and the
first on-device push. Public **store submission** is deliberately out of EAS-1's
scope. This file parks the remaining work so it isn't lost. It also closes out
the remainder of audit item 16 (privacy policy / data-safety / account deletion).

## Android — Google Play

### Accounts & signing
- [ ] Google Play Console developer account (one-time US$25).
- [ ] Decide app signing: **Play App Signing** (recommended) — EAS holds the
      upload key (already generated, EAS-managed), Google holds the app signing key.
- [ ] `production` build → AAB: `cd apps/mobile && eas build -p android --profile production`
      (already configured in `eas.json`: `distribution: store`, `buildType: app-bundle`,
      `autoIncrement: true`).
- [ ] `EXPO_PUBLIC_API_URL` in the `production` profile currently points at the
      placeholder `https://api.aaramvashikshya.com/api/v1` — **confirm the real
      production API origin before the first store build.**
- [ ] `eas submit -p android --profile production` (wire the `submit.production`
      block in `eas.json` with the Play service-account key).

### Required store listing content
- [ ] App title, short description (80 chars), full description (4000 chars) — EN + optionally नेपाली.
- [ ] App icon (512×512), feature graphic (1024×500).
- [ ] Phone screenshots (min 2) — ideally student / parent / teacher flows; both EN and नेपाली.
- [ ] Content rating questionnaire (IARC).
- [ ] Target audience & content (note: app is used by students — check the
      "designed for families" / children policy implications).
- [ ] Category, contact email, external marketing/support URLs.

### Legal / compliance (audit item 16 remainder)
- [ ] **Privacy policy** — authored + hosted at a public URL (required by Play,
      and required because the app handles minors' personal data). Must cover what
      Aaramva collects (names, photos, attendance, guardian contacts), why, how
      long, and third parties (Expo push, Firebase/FCM, eSewa/Khalti, Sparrow SMS,
      S3/R2 storage).
- [ ] **Data safety form** — declare data collected/shared per the privacy policy.
- [ ] **Account deletion** — Play requires an in-app path AND a public web URL to
      request account + data deletion. Neither exists yet (no self-serve delete
      endpoint). Design + build before submission.
- [ ] Nepal-specific: confirm no additional local data-protection obligations.

## iOS — App Store (further out)
- [ ] Apple Developer Program (US$99/yr).
- [ ] `ios.bundleIdentifier` is already `com.aaramvashikshya.mobile`.
- [ ] iOS credentials (distribution cert + provisioning) via `eas credentials`.
- [ ] APNs key for push (separate from FCM V1).
- [ ] `eas build -p ios` + `eas submit -p ios`; App Store listing + privacy nutrition labels.

## Also parked
- [ ] OTA updates policy (`expo-updates` / EAS Update, `runtimeVersion`) — not
      wired; add with a dedicated session if OTA is wanted.
- [ ] `development` profile needs `npx expo install expo-dev-client` before first use.
