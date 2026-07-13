# DX-1 — Fresh-Clone Setup + Contributor Onboarding

**Save location:** `docs/api-contracts/DX-1-developer-setup.md`
**Trigger:** a new regular collaborator (Windows) cloned the repo and it didn't run — bs-calendar's `dist/` is generated, not committed, and nothing tells a human to build it. Audit item 21 (no workspace tooling; bs-calendar consumed three ways) comes due.
**Goal:** `git clone` → follow one doc → running system with demo data, on a machine that has only Node + PostgreSQL 17 installed. Proven by simulating the fresh clone, not by assertion.
**Baselines:** current api/mobile/web counts, all-green on main.

---

## Step 0 — Read and report
1. The full fresh-clone failure surface, empirically: clone the repo into a temp dir (`git clone . ../dx1-fresh-test`) and attempt the naive path (install + run per current README/GETTING-STARTED). Record every failure in order (bs-calendar dist, prisma generate, missing .env, anything else). This ordered failure list IS the spec for T2.
2. How demo data is seeded today: what `npm run seed` (api) creates — does it provision the demo tenant + demo logins end-to-end on an empty database, or does it assume prior state? What are the canonical demo credentials and where are they documented?
3. The three bs-calendar consumption paths (api tsconfig alias, mobile file: dep, web vendored copy) — current exact state.
4. Workspace-tooling evaluation (report, decide with me before implementing): npm workspaces adoption vs staying per-directory. Costs to weigh: CI cache keys, EAS build tarball behavior (the pre-install hook from EAS-1), the web vendored copy. Recommend one; DO NOT restructure without my ack — if the recommendation is "adopt workspaces," that becomes its own future session and DX-1 ships the script-based fix.

## Tasks
T1 — **Root setup script** `npm run setup` (root package.json + a Node script, Windows-first, cross-platform): installs bs-calendar → builds it → installs api/web/mobile → runs `prisma generate` → checks for `apps/api/.env` and, if absent, copies `.env.example` and prints EXACTLY what the human must fill in (DB password, two JWT secrets with a generation hint like `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). Idempotent — safe to re-run.
T2 — **Database bootstrap** `npm run setup:db`: runs public Prisma migrations → tenant runner (provisions/updates schemas) → seed (demo tenant + demo users) — against the developer's OWN local Postgres per their .env. Must work on a completely empty database; fix the seed if Step 0 found it assumes prior state. Prints the demo login credentials at the end.
T3 — **GETTING-STARTED.md rewritten** for a Windows collaborator with nothing but Node + Postgres installed: prerequisites with versions, the two commands, .env filling walkthrough, how to start each app, the LAN-IP note for mobile, the typed-routes regen gotcha, troubleshooting section seeded from Step 0's actual failure list.
T4 — **CONTRIBUTING.md**: branch naming (feat/<session-id>-…), PR flow + all-green requirement + Srijan-merges rule, the standing Claude Code governance rules, spec-first workflow pointer (docs/api-contracts + docs/mobile), CLAUDE.md conventions (dev-notes append style — and the merge-conflict pattern when two branches touch it), secrets policy (own .env, own DB, never share credentials or dumps; personal data stays on Srijan's machine; the OPS-1 dump-over-private-channel exception).
T5 — Kill the sharp edge for good where cheap: whichever bs-calendar consumption path is most fragile (the committed-dist dependency), align it with the setup script's guarantees; full unification only if the T4 workspace decision said script-based is final. Report what changed.

## Verification — raw
1. **The fresh-clone gauntlet (the whole point):** delete the temp clone, re-clone, and follow GETTING-STARTED.md *exactly as written* — every command copy-pasted verbatim, a fabricated developer .env (own scratch DB `aaramva_dx1_test`, fresh secrets). It must reach: api booting + login with the printed demo credentials over live HTTP + web dev server rendering login. Any manual improvisation = a doc bug; fix the doc and re-run the gauntlet clean. Paste the full command-by-command transcript.
2. Scratch DB dropped with read-back; temp clone removed.
3. Existing dev environment unharmed: main working tree clean, api suite unchanged, push + all-green, PR per standing rule.

## Out of scope
Workspace restructuring (if recommended → own session), Docker-based dev environment, teammate's GitHub repo permissions (Srijan does that in Settings → Collaborators), CI changes unless the setup script exposes a gap.
