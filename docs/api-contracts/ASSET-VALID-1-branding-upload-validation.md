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

## The logo is the only uncontrolled colour on the page

Same root cause as everything above — nothing validates what a school uploads — but this one is
about **colour** rather than shape, and it lands on the design's tightest constraint.

`docs/design/billing-print/SPEC.md` builds the document greyscale-first: four greys
(`#111111` ink, `#5a5a5a`, `#b0b0b0`, `#dcdcdc`) and **one** accent, `#0d5c43`. SPEC §Palette is
explicit that "the accent appears in exactly four places per document":

| # | Accent placement | Where |
|---|---|---|
| 1 | header rule (0.75pt) | `receipt-half.ts:259`, `invoice-half.ts:319` |
| 2 | document title | `receipt-half.ts:275`, `invoice-half.ts:338` |
| 3 | total rule | `receipt-half.ts:328`, `invoice-half.ts:513` |
| 4 | **monogram border** | `a5-sheet.ts:375-380` (both halves) |

**Placement 4 is the logo's fallback.** `logoBox` draws the accent-bordered box and accent monogram
*only when there is no logo*; when a school has uploaded one, the image occupies that slot instead.

So an uploaded logo does not add a fifth colour alongside four accent uses — it **substitutes an
uncontrolled colour into the one slot the design reserved for accent #4**, in the header band,
immediately beside the school name. Every other colour on the sheet is fixed in `print/mm.ts`. This
one is whatever the school had on hand, at whatever saturation, and nothing anywhere constrains it.

**What has not been checked: mono photocopy.** Greyscale legibility is the condition the whole
design was built for — a fee slip is photocopied, faxed to a bank, and printed on a mono office
laser far more often than it is seen in colour. Nobody has looked at what a saturated logo does to
the header band under that conversion. Both failure directions are plausible and neither has been
observed:

- a dark saturated logo converting to near-black — a heavy ink blob against `#111111` type
- a light or mid-saturation one converting to near-white — the logo simply vanishing, leaving the
  header band visually unbalanced against the PAN/registration block on the right

Worth checking before ASSET-VALID-1 decides what to recommend, because it may change the
recommendation: a greyscale-conversion preview is a different (and more useful) hint than a
dimensions hint, and the two would be built together.

**Note the asymmetry this creates:** the *fallback* is in-palette and greyscale-safe by
construction, and the *real* asset is the uncontrolled one. A school that has never uploaded a logo
gets a document that provably meets the spec; a school that has uploaded one gets a document nobody
has verified. That is the wrong way round.

## Ink density, not just colour

Colour is one half; **how much ink** is the other, and it fails the same way for the same reason —
nothing looks at the file.

Measured on demo's current logo fixture (`makeLogoPng`, the repo's own generator), drawn into the
12 mm header box:

| | |
|---|---|
| opaque coverage of the box | **66.5%** |
| ink density (coverage × darkness, 100% = solid black) | **47.8%** |
| interior negative space within the disc | **none — it is solid** |

The 66.5% is simply the area of an inscribed disc (`π × 0.46²`); the point is what is *inside* it.
The generator draws three concentric bands of a single hue with no gaps, so at 12 mm on a mono laser
it is a **near-solid dark disc**, and a heavier or darker upload is worse without limit.

**This is the failure mode the design already rejected once.** BILL-PRINT-1 deleted `WARM_PANEL`
outright ("the design has no filled backgrounds", handoff §2) and removed the solid accent-filled
total pill in favour of "weight, size and a 0.75pt rule" (handoff §1). Both renderers still carry
the comment `// No filled shape` at the point where the dominant figure is drawn
(`receipt-half.ts:327`, `invoice-half.ts:517`). A heavy logo reintroduces exactly the filled shape
the document was rewritten to remove — in the header band, where nothing else on the sheet exceeds a
0.75 pt rule.

**So the hint must cover density, not only dimensions and aspect.** A school can satisfy every
dimensional recommendation and still hand over a solid black square. Density is the harder thing to
express usefully to a non-designer, which is an argument for the rendered preview in step (2) rather
than a number: "here is your logo at the size it prints, in black and white" communicates a blob
immediately, where "keep ink coverage under 40%" communicates nothing.

Note this compounds with the colour gap above rather than duplicating it: a saturated logo is a
*colour* problem in colour and a *density* problem in mono, and the mono photocopy check will
surface both at once.

## Fixture-colour decision — demo's logo stays grey (2026-08-21)

demo's branding fixtures were replaced with the repo's own generator output on 2026-08-21, and
`makeLogoPng(tenant.primaryColor)` renders demo's `primaryColor` — `#484c56`, a grey. **Ruled: it
stays grey** (Srijan).

The reason is deliberate and belongs with this ticket rather than reading as an oversight: a coloured
fixture would introduce a fifth colour into a greyscale-first document and make visual review
*harder*, not more realistic. demo is what every visual review runs against, so its logo should not
be quietly asserting a colour decision the design never made. A reviewer looking at a demo slip
should see four greys and one accent — the palette as specified — and judge the layout against it.

This is a fixture choice, not a claim that schools upload grey logos. The real-world case is exactly
the uncontrolled-colour gap above, and it is tested by deliberately checking a saturated logo when
someone gets to it — not by leaving one permanently in the review fixture, where it would colour
every unrelated judgement made against demo from now on.

## A related gap, tracked under FILE-1-BLOB

Confirm-time content-type is read from the stored object's HEAD, which is whatever the client sent
on the PUT. A file mislabelled `image/png` passes every check above, then fails at decode inside
pdfkit — where `optionalImage` / `logoBox` catch it, fall back to the designed blank slot or the
monogram, and record an `AssetMiss` that is logged server-side. **The school is never told.** That
half is recorded in the BILL-PRINT-1 handoff §5.3 rather than here, because the fix belongs with the
rest of FILE-1-BLOB's error mapping.

## Scope sketch (not a plan)

0. **Check what a saturated logo does under mono photocopy** before choosing what to recommend —
   see the colour section above. It may make a greyscale preview the more useful hint, in which case
   it is built alongside (1) rather than after it.
1. **Recommended dimensions *and density* at upload time** — per kind, shown next to the picker,
   with the rendered size named in mm so the number means something ("appears at 12 × 12 mm on a
   bill"). Advisory. This is the agreed first step. Density belongs here too: dimensions alone let a
   school satisfy every recommendation and still upload a solid block.
2. A client-side preview at the true rendered size would tell a school more than any number, and
   needs no server change.
3. Server-side *warnings* (accept, record, surface in settings) before any consideration of
   server-side *rejection*.
4. Rejection, if ever, only for cases that cannot render at all — not for cases that render badly.
