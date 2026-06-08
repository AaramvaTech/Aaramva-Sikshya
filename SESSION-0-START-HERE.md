# Session 0 — Your Very First Claude Code Session

Before touching any school management code, we build the BS Calendar utility.
Why? Because:
1. It has no dependencies — nothing can go wrong except the calendar logic itself
2. It teaches you how Claude Code works in a safe, small context
3. Every other module will need it

This is your training wheels session.

---

## Step 1 — Install the tools (do this once)

Open your terminal (Command Prompt / PowerShell on Windows, Terminal on Mac/Linux).

```bash
# Install Node.js first if you don't have it
# Download from: https://nodejs.org (LTS version)

# Check it installed
node --version    # Should show v18 or higher
npm --version     # Should show 9 or higher

# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Check it installed
claude --version
```

---

## Step 2 — Create your project folder

```bash
# Go to where you keep projects (adjust path to your preference)
cd ~/Documents

# Create the project
mkdir aaramva-shikshya
cd aaramva-shikshya

# Create the folder structure
mkdir -p packages/bs-calendar/src
mkdir -p docs/api-contracts
mkdir -p apps/api
mkdir -p apps/web
mkdir -p apps/mobile
```

---

## Step 3 — Copy in your files

Copy these files from the downloads into your project:
- `CLAUDE.md` → `aaramva-shikshya/CLAUDE.md`
- `LEARNING-GUIDE.md` → `aaramva-shikshya/LEARNING-GUIDE.md`
- `00-bs-calendar.md` → `aaramva-shikshya/docs/api-contracts/00-bs-calendar.md`
- `01-foundation.md` → `aaramva-shikshya/docs/api-contracts/01-foundation.md`
- `02-student.md` → `aaramva-shikshya/docs/api-contracts/02-student.md`

---

## Step 4 — Initialize the bs-calendar package

```bash
cd packages/bs-calendar
npm init -y
npm install --save-dev typescript jest @types/jest ts-jest
```

Create a `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  }
}
```

Create a `jest.config.js`:
```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
};
```

---

## Step 5 — Start Claude Code

```bash
# Go back to root of project
cd ~/Documents/aaramva-shikshya

# Start Claude Code
claude
```

You'll see Claude Code start up. Now paste this prompt:

---

## The exact prompt to paste (copy everything between the lines)

---
Read CLAUDE.md in full first. Confirm you've read it before doing anything.

Then read docs/api-contracts/00-bs-calendar.md in full.

We are building Aaramva Shikshya — a school management system for Nepal.
Your first task is to build the BS Calendar utility package.

Location: packages/bs-calendar/

Here is exactly what to build:

1. Create src/data.ts with the BS_MONTH_DATA lookup table exactly as provided in the spec. Do not change any values.

2. Create src/index.ts with these exported functions:
   - adToBs(adDate: Date): BsDate
   - bsToAd(bsDate: BsDate): Date
   - formatBs(bsDate: BsDate, lang: 'en' | 'np'): string
   - todayBs(): BsDate
   - getBsYear(adDate: Date): number
   - daysInBsMonth(year: number, month: number): number
   - isValidBsDate(bsDate: BsDate): boolean
   - getCurrentFiscalYear(): string
   - parseBsString(dateStr: string): BsDate

3. Create src/index.test.ts with ALL test cases listed in the spec.

4. Make sure the tests pass by running: npm test

Use the reference point: 1 Baisakh 2000 BS = 13 April 1943 AD.

Explain what you are building at each step so I can follow along and learn.
---

---

## What to watch for while Claude Code works

Claude Code will explain each step. Read the explanations — don't skip them.
Ask yourself: "Do I understand what this function does?"

If something is confusing, stop Claude Code and come ask me in Claude.ai.

---

## When Claude Code finishes

Run the tests yourself:
```bash
cd packages/bs-calendar
npm test
```

You should see something like:
```
PASS src/index.test.ts
  BsCalendar
    ✓ converts AD 2024-04-13 to BS 2081-01-01
    ✓ converts AD 2024-01-01 to BS 2080-09-17
    ... (all tests passing)

Test Suites: 1 passed
Tests:       10 passed
```

If all tests pass — you've completed Session 0. 🎉

---

## What you learned in Session 0

- How to run Claude Code
- What a TypeScript function looks like
- What a test file does (verifies the function works)
- How to run tests
- How the BS calendar conversion algorithm works conceptually

---

## Next step

Come back to Claude.ai and say:
"Session 0 done — all [X] tests are passing. Ready for Session 1."

I'll give you the Session 1 briefing and make sure you understand
what you're about to build before you build it.
