# FIX-2 — TZ-Independent BS→AD Conversion in CSV Import

**Save location:** `docs/api-contracts/FIX-2-tz-independent-import.md`
**Scope:** apps/api, small. Source: CI's first real run — import.service.ts BS→AD conversion uses local-time Date components, so under UTC (GitHub runners, un-pinned servers) imported dates of birth shift back one day. Currently mitigated by TZ pins in CI + Docker image; this removes the underlying bug.

## Step 0
1. Read the conversion path in import.service.ts and the bs-calendar package's API: does bs-calendar return a `Date` object or year/month/day components? Report the exact code that formats the AD date string.
2. Grep apps/api for other `toISOString()` / `getFullYear()`-style local-component date formatting on date-only values (the FIX-1A sweep never covered the api). Classify hits: date-only (fix), timestamp (leave), display (note). Paste the list.

## T1
- Make the conversion TZ-independent: if bs-calendar yields components, format `YYYY-MM-DD` directly from them (zero Date-object round-trip); if it yields a Date, replace with component-based construction. Fix any other class-(date-only) hits from Step 0 the same way — shared helper if ≥2 sites.

## T2 — Proof the fix is real
- Unit tests for the conversion covering month/era boundaries (verify expected AD values against the bs-calendar lookup table, and spot-check one date against an authoritative BS↔AD source, noting it in the test comment).
- **The decisive proof:** run the FULL api suite twice locally — `TZ=Asia/Kathmandu` and `TZ=UTC` — both must pass ≥298. Paste both summary blocks.
- Keep the CI + Docker TZ pins (they encode the platform's Nepal-local convention, independent of this bug); update the FIX-2 dev-note in CLAUDE.md to "resolved" with the suite-passes-under-UTC fact.

Commit `fix(api): TZ-independent BS→AD conversion (FIX-2)`, push, paste all-green.
