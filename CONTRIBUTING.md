# Contributing to Aaramva Shikshya

New here? Do the fresh-clone setup first: **[`GETTING-STARTED.md`](./GETTING-STARTED.md)**.
Conventions (naming, response format, multi-tenancy, module structure) live in
**[`CLAUDE.md`](./CLAUDE.md)** — read it before writing code.

---

## Spec-first workflow

Work is organised into **sessions**, each with a short id (e.g. `EAS-1`, `POL-2`,
`DX-1`). Every session starts from a written spec, not a vibe:

- Backend / web specs → `docs/api-contracts/`
- Mobile specs → `docs/mobile/`

**Read the relevant spec in full before touching code.** If the task conflicts
with `CLAUDE.md` or the spec is ambiguous, stop and ask — don't guess.

---

## Branches

- Branch off `main`. Never commit directly to `main`.
- Name branches `<type>/<session-id>-<slug>`:
  - `feat/dx-1-developer-setup`, `feat/eas-1-android-build`
  - `fix/…`, `chore/…`, `docs/…` for non-feature work
- Keep a branch scoped to one session's work.

---

## Pull requests

1. **All-green before you open a PR.** Run the suites for whatever you touched:
   - API: `cd apps/api && npm test`
   - Mobile: `cd apps/mobile && npm test`
   - Web: `cd apps/web && npx tsc --noEmit` (type-check)
2. Push your branch and open a PR against `main`.
3. In the PR body, state what changed, the spec id, and paste the verification
   evidence (test counts, live proof, etc.).
4. **Srijan merges.** Only the project owner merges PRs. Don't merge your own.

### Standing rules for Claude Code (automation governance)

These are hard rules for any AI/automation contributor:

- **Never merge PRs, close PRs, or perform GitHub account actions beyond
  `git push`** — unless the current instruction explicitly says to.
- If a dependency (another branch/PR) is unmerged, **stop and ask** rather than
  working around it.
- Never skip Git hooks or bypass commit signing unless explicitly asked.

---

## `CLAUDE.md` conventions

`CLAUDE.md` is the project's living memory and is loaded every session.

- Its **"What's built so far"** checklist and **dev-notes** are **append-style** —
  each session adds an entry describing what shipped and the non-obvious gotchas.
  Don't rewrite history; add to it.
- **Merge-conflict pattern:** because nearly every branch appends to `CLAUDE.md`,
  two branches will often both add lines in the same region and conflict on merge.
  Resolve by **keeping both entries** (yours and theirs) in session order — it's an
  append log, so the resolution is almost always "take both", never "pick one".

---

## Secrets & data policy

- **Your own `.env`, your own database.** Never commit `.env` (it's gitignored)
  and never share secrets. Each developer runs a local Postgres with their own
  credentials; `apps/api/.env.example` documents the shape.
- **Never share credentials or database dumps** in the repo, chat, issues, or a
  shared drive. Production/real dumps stay off every shared surface.
- **Personal / real school data stays on the owner's machine.** Develop against
  the seeded **demo** school (`npm run setup:db`), not against real tenant data.
- **The one sanctioned exception** is the OPS-1 runbook's backup/restore flow: a
  `pg_dump` may be handed **directly to the owner over a private channel** for a
  restore or an incident investigation (see `docs/ops/RUNBOOK.md`). That is the
  only time a dump changes hands — never publicly, never committed.

---

## Before you say "done"

Verify, don't assert. Run the commands, confirm the output, and only then claim
it works. If tests fail or a step was skipped, say so.
