# SMS Project — Quick Start Guide

## What's in this folder

| File | Purpose |
|------|---------|
| `CLAUDE.md` | The master memory file. Give this to Claude Code at the start of EVERY session. |
| `docs/api-contracts/00-bs-calendar.md` | Build this FIRST — Nepali date utility |
| `docs/api-contracts/01-foundation.md` | Session 1 — Project scaffold + Auth + Multi-tenancy |
| `docs/api-contracts/02-student.md` | Session 2 — Student admission & enrollment |

---

## How to use these files with Claude Code

### 1. Install Claude Code
```bash
npm install -g @anthropic-ai/claude-code
```

### 2. Start a session
```bash
cd your-project-root
claude
```

### 3. Every session — paste this first
```
Please read CLAUDE.md in full before doing anything else.
Then read the relevant spec from docs/api-contracts/.
Confirm you've read both before starting work.
```

### 4. Session order
1. `00-bs-calendar.md` — the calendar utility (standalone, no deps)
2. `01-foundation.md` — auth + tenancy (everything else depends on this)
3. `02-student.md` — first real module
4. Continue with other modules from the build order in CLAUDE.md

---

## Working with Claude.ai (this chat) alongside Claude Code

**Come to Claude.ai (me) when you need to:**
- Design the database schema for a new module
- Review code Claude Code produced
- Debug something Claude Code couldn't fix in 2 tries
- Plan the API contract for the next session
- Understand an error or architectural problem
- Get the Claude Code prompt for the next module

**Use Claude Code for:**
- Writing all the actual code
- Running tests and fixing failures
- Refactoring existing files
- Generating migrations

---

## Red flags to watch for in Claude Code output

- Any `PrismaService` used directly (should always be `TenantPrismaService`)
- Any hardcoded tenant schema names
- Dates displayed without BS conversion
- Missing `@Roles()` guard on controller methods
- Soft delete bypassed (using `delete()` instead of `update({ deletedAt })`)
- Missing pagination on list endpoints
- Missing validation in DTOs

---

## Asking Claude.ai to review Claude Code output

Paste the generated code and say:
> "Review this [module name] code against our CLAUDE.md conventions.
> Check for: tenant isolation, missing guards, date handling, response format, soft deletes."

I'll catch anything that doesn't match the conventions.
