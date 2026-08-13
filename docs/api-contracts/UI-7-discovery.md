# UI-7 — Settings: Discovery Report

**Status:** Discovery only. No code touched, no branch created. Seventh and final Billing-rail
phase (Catalog ✓ → Assignment ✓ → Bill Runs ✓ → Payment Counter ✓ → Corrections ✓ → Reports ✓ →
**Settings**).

**Method:** every controller/service/DTO read directly, plus a full read of the existing
`apps/web/app/(school)/settings/page.tsx` (409 lines, read in full, not skimmed) and its
supporting types/hooks — the single most load-bearing finding this phase turned up.

---

## 1. Backend surface — two separate endpoints, two separate role tiers

**Not one unified settings endpoint — confirmed by reading both controllers directly.**

| Endpoint | Fields | Read roles | Write roles |
|---|---|---|---|
| `GET/PATCH /finance/settings` (`FinanceSettingsController`) | `invoiceNumberingReset` (bool), `creditNoteApprovalThreshold` (money string in, number out) | `ACCOUNTANT_AND_ABOVE` | **`OWNER_ONLY`** (`PLATFORM_ADMIN`, `SCHOOL_OWNER`) |
| `GET/PATCH /settings/profile` (`SettingsController`) | everything else — see below | `VIEWER_ROLES` = `EDITOR_ROLES` + `ACADEMIC_COORDINATOR`, `ACCOUNTANT` | **`EDITOR_ROLES`** = `PLATFORM_ADMIN`, `SCHOOL_OWNER`, **`PRINCIPAL`** |

**This is the first thing worth flagging plainly, since the user's own framing assumed a single
tier:** the write roles genuinely differ. `finance/settings` is strictly owner-tier (matches the
BILL-1/BILL-5 pattern the user named). `settings/profile` — which is where `brandColor`,
`printLanguage`, and the bill-header fields actually live — is **PRINCIPAL-inclusive**. A UI-7
screen combining both groups needs two different in-page write gates, not one — same shape as
UI-4/UI-5's `OWNER_ROLES`/`isOwner` in-page check, applied to a *second*, narrower field group
this time instead of the whole page.

**`UpdateProfileDto` fields relevant to this phase** (`apps/api/src/modules/settings/dto/
settings.dto.ts`, read in full):

- `brandColor?: string` — `@IsIn(BILL_BRAND_COLORS)`. The curated 8-color print-accent set
  (`apps/api/src/common/tenant-brand-color.ts`): slate `#475569`, green `#0f6e56`, blue `#1e5aa8`,
  maroon `#9a2c2c`, purple `#6b3fa0`, amber `#b45309`, teal `#0e7490`, rose `#a1306e`. **Not the
  same value as `primaryColor`** (the free-hex web-branding color the page already has a picker
  for) — a separate, print-only accent, deliberately restricted because "print media has no
  runtime contrast-ratio enforcement" (the file's own comment). No display names are exported
  anywhere — only inline code comments (`// slate`, `// green`, …) — the web needs its own small
  label map for these 8 swatches.
- `printLanguage?: string` — `@IsIn(PRINT_LANGUAGES)`, `PRINT_LANGUAGES = ['EN', 'NE', 'BOTH']`
  (`bill-print-labels.ts`). Shape-validated at the DTO layer; the "is Nepali print actually
  allowed yet" business rule is a separate runtime check in the service (§3).
- Bill header fields already present: `panNumber`, `registrationNumber`, `affiliationBoard`,
  `affiliationNumber`, `address`, `phone`, `alternatePhone`, `motto` (tagline), `province`,
  `district`, `principalName`, `principalSignatureUrl`/`*FileKey`, `schoolStampUrl`/`*FileKey`.
- **Two fields named in the user's scope that do NOT exist in this DTO at all — see §5.**

---

## 2. Existing settings-page pattern — not just present, extremely mature

**Confirms the user's own instinct exactly: this slots into the existing page, not a standalone
one.** `apps/web/app/(school)/settings/page.tsx` (read in full) already has:

- A hero card (logo, name, motto) + a single page-wide Edit/Save/Cancel toggle.
- Four `<Section>` blocks (`School Identity`, `Contact & Location`, `Registration & Affiliation`,
  `Principal & Official Stamp`), each a `<Grid>` of reusable field components: `FieldText`,
  `FieldTextarea`, `FieldColor` (currently wired to `primaryColor`'s free hex, not the curated
  set — a new variant is needed for `brandColor`, not a reuse of this one as-is), `ImageField`
  (already does the full FILE-1 presign-on-save flow: local preview via `FileReader`, upload
  deferred to Save, `pendingFiles` state, 2 MB client-side size guard, `useFileUrl` resolving a
  stored key or public URL transparently).
- `ChangePasswordCard` at the bottom (MAIL-1 T4, unrelated to this phase, untouched).
- **One detail worth noting, not fixing:** a `Palette` icon is already imported from
  `lucide-react` at the top of the file and is **completely unused** anywhere in the current
  JSX — looks like it was reserved for exactly the branding section this phase adds. Convenient,
  not a coincidence worth over-reading.

**`useSchoolProfile`/`useUpdateSchoolProfile`** (`lib/hooks/use-settings.ts`) wrap
`GET`/`PATCH /settings/profile` already — extending, not replacing. **`useFinanceSettings`**
(`GET /finance/settings`) already exists too, but READ-only, and lives in an odd home:
`lib/api/bill-correction.api.ts`/`lib/hooks/use-bill-correction.ts` — built there by UI-5 purely
because that phase needed the threshold for its cap preview (`UI-5-SPEC.md` ruling 1: "editing it
is UI-7 scope"). **This phase needs to add the PATCH method** — either alongside the existing GET
in that same file, or relocated to a more natural `settings.api.ts`/`use-settings.ts` home. Small
call, not a blocker either way, flagged for the spec.

**Client-side role gating gap, pre-existing, not caused by this phase but relevant to it:** the
page has no role check of its own — `SETTINGS_VIEWERS` (`route-access.ts`) includes
`ACCOUNTANT`/`ACADEMIC_COORDINATOR`, who can reach `/settings` and see "Edit Profile," but the
backend's `EDITOR_ROLES` would 403 their save. This phase should not silently inherit that gap
for its *own* new fields — see §1's two-tier point. Whether to also fix it for the existing
fields is a call for the spec, not decided here.

---

## 3. The Devanagari review gate — a hardcoded source constant, not API-settable at all

**Direct answer to the question as posed:** no, a tenant cannot self-serve this, and there is
**no database column, no env var, and no API surface for it whatsoever.**
`apps/api/src/common/nepali-print-review-gate.ts` is a single exported boolean constant:

```ts
export const NEPALI_PRINT_REVIEWED = true;
```

Its own docblock is explicit about the mechanism: "ONLY Srijan flips this — via an explicit,
separate, reviewable commit... Never set to true as a side effect of any other change." It is
also **global, not per-tenant** — "the thing being reviewed is the shared translation/rendering
logic, not tenant data."

**The state that actually matters for this phase's UI decision: it is currently `true`.**
`REVIEWED 2026-07-30` — Srijan confirmed the Devanagari sample bill/receipt to a native reader.
`settings.service.ts`'s `updateProfile` checks it at write time
(`dto.printLanguage !== 'EN' && !NEPALI_PRINT_REVIEWED` → 400) and `bill-print-labels.ts`'s
`resolveLanguage` checks it again at render time as defense-in-depth (falls back to `EN` even if
a stored value somehow disagreed). **Both checks are currently inert** — nothing is blocked today.

**So: the UI does not need a disabled/explained toggle right now.** Building one for a gate that
is presently open would be exactly the kind of speculative UI the user's own framing warned
against ("if a tenant genuinely can't self-serve... not offer a broken toggle" — today, every
tenant *can*). What the UI does need, cheaply: if `NEPALI_PRINT_REVIEWED` is ever flipped back
(a future re-review after a shared-logic change), the PATCH will 400 with the exact human-readable
message already quoted above — the existing generic form-error toast pattern (`extractApiErrors`,
already used on this very page) surfaces it correctly with zero special-case code. No bespoke
"pending review" state is worth building against a hypothetical future flip.

---

## 4. Proposed screen breakdown

**Not a new page. Two new `<Section>` blocks on the existing `/settings` page**, matching its
established four-section shape:

1. **"Billing Documents"** (editable by `EDITOR_ROLES` — same tier as every other section on this
   page, no new gating needed here): `brandColor` (a new small swatch-picker component — 8 fixed
   circles, not a hex input, matching the curated set — `FieldColor` is the wrong component,
   reused only as visual inspiration), `printLanguage` (a plain 3-option `<Select>`, EN/NE/BOTH),
   `paymentInstructions` (a `FieldTextarea`, reused as-is), a QR image (`ImageField`, reused as-is
   once the backend gap in §5 closes).
2. **"Billing Policy"** (the one genuinely new gating shape on this page — `OWNER_ONLY`,
   `PLATFORM_ADMIN`/`SCHOOL_OWNER` only): `invoiceNumberingReset` (a toggle/switch — the DTO is a
   plain boolean, no existing toggle component was spotted in this file, worth checking
   `components/ui/` for one already built elsewhere before adding a new primitive), `creditNoteApprovalThreshold`
   (a money `<Input>`, same shape as `FieldText` with `type="number"` — a "money" `FieldText`
   variant, not a new component). **Rendered conditionally** — hidden or visibly disabled for a
   `PRINCIPAL` viewing the page, exactly the split §1 requires. Whether "hidden" or "visible but
   disabled with a note" reads better is a call for the spec/build, not decided here — UI-4/UI-5
   precedent (`isOwner` gating a whole action) leans toward hidden, but this is a settings *value*
   a PRINCIPAL might legitimately want to *see* even if they can't change it, which argues for
   visible-but-disabled instead. Flagged as the one real design choice this phase has.

**Both sections use the page's one existing Edit/Save/Cancel toggle** — no new save button, no
new dialog, consistent with how the page already treats four sections as one edit session.

---

## 5. Backend gaps

**One real, clean gap — confirmed by reading both the write path (`UpdateProfileDto`) and the
read path (`PROFILE_SELECT`/`toProfileResponse` in `settings.service.ts`) — neither exposes these
two fields at all, despite both existing on the `tenants` table and being actively read by bill
rendering:**

1. **`paymentInstructions` (text) and `qrImageUrl` (text) are entirely absent from the settings
   API — read AND write.** Confirmed live: `apps/api/prisma/schema.prisma` has both columns
   (migration `20260725075730_bill1_tenant_header_fields`); `bill-document.service.ts` and
   `bill-pdf.service.ts` both read and render them on every printed bill. There is no code path
   anywhere in `src/` that writes either column — a tenant that wants payment instructions or a
   QR code on their bills currently has no way to set them short of a manual database edit.
   **This is the phase's one real, closable gap**, same shape as every prior phase's finding:
   - `paymentInstructions`: add as a plain optional string field to `UpdateProfileDto` +
     `PROFILE_SELECT`/`toProfileResponse` — no new infrastructure, mirrors `motto`/`description`
     exactly.
   - `qrImageUrl`: needs a **new FILE-1 kind**, `qr-image`, in `storage.policy.ts` — modeled
     directly on the existing `principal-signature`/`school-stamp` entries (`maxBytes: 1 * MB,
     contentTypes: IMAGE_TYPES, uploadRoles: SETTINGS_EDITORS, publicRead: false`), plus a
     `qrImageFileKey` field on the DTO following the exact same `*FileKey`-wins-over-`*Url`
     pattern the other three image fields already use.
2. **`PATCH /finance/settings` has no web wrapper yet** — only the GET half exists (§2). Small,
   additive, not really a "gap" so much as "half the phase's own work."

**Nothing else missing that a direct read turned up.** `brandColor` and `printLanguage` are both
already fully wired end-to-end on the backend (validated, gated, persisted, read back) — this
phase's backend work is genuinely small: two fields added to one existing DTO/service pair, one
new storage kind. No new controller, no new migration beyond what BILL-1 already shipped.

---

## Summary

| Question | Answer |
|---|---|
| One settings endpoint or several | **Two**, with two different write-role tiers — `finance/settings` (OWNER_ONLY) and `settings/profile` (PRINCIPAL-inclusive). Not the single OWNER_ONLY surface the framing assumed. |
| Existing settings-page pattern | Yes, mature — four `<Section>`/`<Grid>` blocks, reusable `FieldText`/`FieldTextarea`/`FieldColor`/`ImageField`, full FILE-1 upload flow already built. This phase extends it, doesn't replace it. |
| Devanagari gate | Hardcoded TS constant, zero API surface, **currently `true`** (reviewed 2026-07-30) — no disabled/explained toggle needed today; the existing generic error-toast handles a hypothetical future re-gate for free. |
| Screen breakdown | Two new `<Section>`s on the existing page: "Billing Documents" (PRINCIPAL-editable, matches the page's existing tier) and "Billing Policy" (OWNER_ONLY — the one new in-page gating shape this phase introduces). |
| Backend gaps | `paymentInstructions`/`qrImageUrl` — real columns, actively rendered, zero API exposure (read or write). One new FILE-1 kind (`qr-image`) needed. `finance/settings` PATCH needs its first web wrapper. |
| Open design call | Hidden vs. visible-but-disabled for the OWNER_ONLY section when a PRINCIPAL is viewing — not decided here. |
