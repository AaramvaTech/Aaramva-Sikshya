# I18N-1 — Nepali Language: Mobile Apps

**Save location:** `docs/mobile/I18N-1-nepali-mobile.md`
**Scope:** apps/mobile, all three role apps. Web i18n is a future I18N-2 — mobile first because parents/students are the Nepali-language audience; staff on the web portal skew English-comfortable. Audit item 20: `BS_MONTH_NAMES_NP` and the Devanagari font wiring (NpText) exist but are unused; all UI copy is English.
**Baseline:** api 511 untouched, current mobile jest count, all-green on main.

---

## Design (fixed)
- **Library:** i18next + react-i18next with expo-localization for device-locale default (Step 0 verifies fit with the repo; if the repo has a lighter established pattern, flag before substituting).
- **Two locales:** `en` (extracted, becomes the source of truth) and `np` (नेपाली). Locale files per app-area, not one monolith (`common.json`, `student.json`, `parent.json`, `teacher.json`, `auth.json`).
- **Toggle:** language selector in each app's profile/settings screen + on the login screen (a parent who can't read English can't find a buried setting). Persisted (AsyncStorage — not secure-store; it's not a secret). Default = device locale if `ne*`, else English.
- **Numerals & dates policy (v1):** dates render in BS with **Nepali month names** (`BS_MONTH_NAMES_NP` finally earns its keep) when locale=np; numerals stay Arabic (0–9) everywhere in v1 — Devanagari numerals (०–९) are a flagged future decision, noted in code. Currency stays "Rs" formatting.
- **NpText/font:** Devanagari must render correctly wherever np strings appear — Step 0 confirms whether the font wiring is global or needs NpText wrapping, and the sweep follows that mechanically.
- **No machine-babble rule:** translations must be natural school-domain Nepali (the register a school notice would use), not literal word-swaps. Terms like attendance (हाजिरी), homework (गृहकार्य), fees (शुल्क), result (नतिजा), leave (बिदा) use the words Nepali schools actually use.

## Step 0 — Read and report
1. String inventory: sweep all three apps for user-facing literals (screen titles, buttons, empty/error states, status chips, toasts). Report the approximate count per app and the extraction plan. Backend-originated strings (notification bodies, API error messages) are OUT of scope — flag their existence for a future backend-i18n decision, translate only the client-side fallbacks.
2. NpText/font wiring: global or per-component; what BS date components currently render and where month names come from.
3. expo-localization availability in SDK 56 managed workflow; AsyncStorage presence.
4. The BsDate/date-helper call sites that will need locale-aware month names.

## Tasks
T1 — Infrastructure: i18next setup, locale persistence + device-default, the toggle UI (settings + login), a `useLocale` hook; BsDate (or equivalent) grows locale-aware month names.
T2 — **The sweep, app by app** (student → parent → teacher), committed per app so review is sane: every user-facing literal → `t()` key; en.json = extracted originals; np.json = natural translations per the no-machine-babble rule. Interpolations for dynamic values (never string concatenation — Nepali word order differs).
T3 — Tests: locale switch flips a sampled set of strings (jest), BS date renders Ashadh vs असार by locale, persistence survives a simulated restart, missing-key fallback = English (never a raw key on screen).

## Verification — raw + human
1. Step 0 inventory counts, then post-sweep grep proof: no user-facing literals remain in the swept screens (spot-check methodology reported).
2. Locale-flip proofs (jest render): the same screen sampled in en and np.
3. BS date proof: one date rendered both ways, month name cross-checked against BS_MONTH_NAMES_NP.
4. **Srijan's native review (the human gate):** the session pauses and presents the np.json files (or a readable two-column en→np table per app) for Srijan to read. He corrects anything unnatural; corrections applied verbatim. The session may NOT self-certify translation quality — this gate requires his sign-off.
5. Mobile jest ≥ current, tsc clean (typed-routes gotcha), api 511 untouched, push + all-green, PR per standing rule.

## Out of scope
Web i18n (I18N-2), backend message i18n (notifications/SMS/emails — flagged, future), Devanagari numerals, RTL (n/a), other languages.
