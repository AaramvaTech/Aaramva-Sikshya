# MAIL-3 — Tenant-Aware Sender Identity & Per-Recipient Credential Templates

**Repo path:** `docs/api-contracts/MAIL-3-tenant-sender-identity.md`
**Depends on:** MAIL-2 merged to main (real SMTP transport must exist first)
**Bugs file:** `MAIL-3-BUGS.md`
**Branch:** `feat/mail-3-tenant-sender-identity` from fresh `main` → PR → CI green → Srijan merges.

## 1. Scope & model

All email is sent by the platform through the single Brevo/SMTP account — schools never operate mail infrastructure. What varies per send is **presentation**:

- **Tenant-scoped sends** (staff, guardian, student credentials; later resets/notices):
  `From: "{School Name} (via Aaramva Shikshya)" <MAIL_FROM_ADDRESS>` with `Reply-To: {school official email}`. Template header carries the school name; footer carries "powered by Aaramva Shikshya (आरामवा शिक्षा)".
- **Platform-scoped sends** (new-school owner credentials from register-school):
  `From: "Aaramva Shikshya" <MAIL_FROM_ADDRESS>`, no Reply-To override, platform template.

Out of scope: per-school sending domains (white-label — future premium), logo embedding, SMS real sends (REG-G-SMS still blocked), any change to MAIL-2's transport/classifier.

## 2. Recipient-type differentiation

New enum `credential_template_type`, stored on the ledger so every send is auditable and the poller never guesses:

| template_type | Trigger | Audience & content |
|---|---|---|
| `NEW_SCHOOL_OWNER` | register-school provisioning | Platform identity. "Your school administrator account for {School} on Aaramva Shikshya." |
| `STAFF` | staff registration / resend | School identity. "Your staff account at {School}." Role mentioned. |
| `GUARDIAN_SELF` | guardian's own account creation / resend | School identity. "Your parent/guardian account at {School}." |
| `STUDENT_VIA_GUARDIAN` | student fan-out rows routed to guardian (`recipient_user_id` ≠ `user_id`) | School identity, addressed to the guardian. MUST name the student and the student's username. "Login details for {Student Name} at {School} — for your child." |
| `STUDENT_SELF` | student fan-out rows to the student's own contacts | School identity, addressed to the student. "Your student account at {School}." |

- Migration 0015: `credential_deliveries.template_type TEXT NOT NULL` with CHECK on the five values; backfill existing rows via derivation (role + `recipient_user_id`), default not allowed for new rows — enqueue must set it explicitly.
- Resend endpoint re-derives the same type as the original registration path.
- SMS bodies get the same five variants: ASCII English, ≤160 chars each (1 Sparrow credit), enforced by a unit test that fails if any rendered SMS template with max-length realistic fixtures exceeds 160 chars. (Bodies still only ever sent when `SMS_DRY_RUN=false`; unchanged.)

## 3. School identity settings

- Discovery first: inspect the existing school/tenant profile shape. Reuse the existing school name field; if an official/office email field already exists, reuse it as Reply-To. Only add a new column (`official_email`, nullable) if none exists — report the finding in MAIL-3-BUGS before migrating.
- Fallback chain when `official_email` is null: omit Reply-To (parents reply nowhere rather than to a wrong address); template still shows school name. Never fall back to the platform address as Reply-To.
- Web: add the official-email field to the school settings form (school-admin editable), standard email validation, field-level 400 rendering per REG-1 Phase 5 conventions.
- Nepali content note: email bodies may carry a Devanagari line (length is free in email); SMS variants stay ASCII per §2.

## 4. Phases

**Phase 1 — Data + rendering (code).**
Migration 0015 (canary → all tenants, LF, checksum ledger) + official-email discovery/migration if needed. Enqueue paths set `template_type` for all five flows. Sender-identity resolver (tenant name + Reply-To vs platform). Five email templates + five SMS bodies with the ≤160 ASCII test. Web settings field. Unit tests: identity resolution per type, fallback chain, resend type re-derivation, SMS length. Redaction re-run (temp password never in logs). Floors: whatever main holds at branch time — report exact API/web/mobile numbers at checkpoint. **Checkpoint 1.**

**Phase 2 — Live proof.**
One live send per template type to Srijan's real inbox (5 emails: register-school throwaway tenant for NEW_SCHOOL_OWNER with DROP SCHEMA teardown; staff; guardian; student with both guardian-routed and self-routed rows). For each: ledger read-back showing correct `template_type`, then Srijan verifies From display name, Reply-To behavior (hit reply on one tenant-scoped email — it must address the school's official email), and body correctness. Cleanup: soft-delete probes, teardown tombstone. Push, PR `MAIL-3: tenant-aware sender identity + per-recipient templates`. **Checkpoint 2 — Srijan's inbox confirmation is the acceptance bar.**

## 5. Proof standards

Unchanged: raw output, live HTTP + SELECT read-backs, no mocked-only claims for anything touching the ledger, poller, or SMTP. Claude Code cannot self-certify inbox presentation — the From/Reply-To/body check is human.
