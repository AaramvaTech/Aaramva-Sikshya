# ASSET-VALID-1 — branding uploads have no shape validation

**Status: open, not started.** Recorded 2026-08-21 during BILL-RCPT-STATUS Phase 2, from a question
about why demo's A5 printed three solid colour blocks.

**Preferred first step is a recommended-dimensions hint at upload time, NOT server-side rejection**
(Srijan, 2026-08-21). A school that has one usable scan of a signature should not be blocked from
uploading it because it is 180px tall.

---

## What is enforced today

Three kinds are affected: `school-logo`, `principal-signature`, `school-stamp` (and `qr-image`,
which is modelled on them).

| Layer | Enforced |
|---|---|
| `POST /files/presign-upload` | content-type ∈ `image/jpeg`, `image/png`, `image/webp`; role ∈ `SETTINGS_EDITORS`; kind known |
| `verifyConfirmedKey` | key shape / tenant / kind match; HEAD size ≤ 2 MB (logo) or 1 MB (signature, stamp); content-type re-checked against the same three |
| Web (`app/(school)/settings/page.tsx:464`, `components/onboarding/branding-step.tsx:126`) | `accept="image/*"` on the file input |

## What is not

**No dimension, aspect-ratio, minimum-resolution, transparency, or image-content validation exists
anywhere — server or client.** Verified by reading `storage.policy.ts`, `storage.service.ts`,
`storage.controller.ts` and the settings/onboarding upload sites; grepping those for
`width|height|dimension|aspect|sharp|image-size|probe` returns nothing.

Consequences observed live:

- A school uploading a coloured square gets a coloured square printed on its bills and receipts.
  This is exactly what demo did until 2026-08-21 — three solid RGB rectangles (120×120, 200×50,
  90×90), which is what prompted this ticket.
- A school uploading a 4000×3000 photo of a signed page gets it letterboxed into the signature
  reserve and drawn about 1.5mm tall. See BILL-PRINT-2 for that geometry — the two tickets
  interact, and fixing validation without fixing the reserve leaves the school no better off.
- `accept="image/*"` is a picker hint only, and is **looser** than the server: `image/gif` and
  `image/avif` pass the file picker and then fail the presign with a 400.

## A related gap, tracked under FILE-1-BLOB

Confirm-time content-type is read from the stored object's HEAD, which is whatever the client sent
on the PUT. A file mislabelled `image/png` passes every check above, then fails at decode inside
pdfkit — where `optionalImage` / `logoBox` catch it, fall back to the designed blank slot or the
monogram, and record an `AssetMiss` that is logged server-side. **The school is never told.** That
half is recorded in the BILL-PRINT-1 handoff §5.3 rather than here, because the fix belongs with the
rest of FILE-1-BLOB's error mapping.

## Scope sketch (not a plan)

1. **Recommended dimensions at upload time** — per kind, shown next to the picker, with the
   rendered size named in mm so the number means something ("appears at 12 × 12 mm on a bill").
   Advisory. This is the agreed first step.
2. A client-side preview at the true rendered size would tell a school more than any number, and
   needs no server change.
3. Server-side *warnings* (accept, record, surface in settings) before any consideration of
   server-side *rejection*.
4. Rejection, if ever, only for cases that cannot render at all — not for cases that render badly.
