# Learning While Building — Aaramva Shikshya

This file is your personal learning companion.
Every time Claude Code does something, come here to understand WHY it did it.
You don't need to memorize anything — just understand the concept well enough
to make decisions and spot mistakes.

---

## The golden rule for learning this way

> "I don't need to know how to write it from scratch.
>  I need to know what it does, why it's there, and if it's wrong."

Claude Code writes the code. You are the architect and decision-maker.
A good architect doesn't lay every brick — they know if the bricks are in the right place.

---

## Concept 1 — What is a backend? What is an API?

**Plain English:**
Your school app has two parts:
- The **frontend** (what people see — the website/app)
- The **backend** (the brain — handles data, logic, security)

They talk to each other through an **API** (Application Programming Interface).
Think of it like a waiter in a restaurant:
- You (frontend) place an order (request)
- The waiter (API) takes it to the kitchen (backend/database)
- The kitchen prepares it and the waiter brings it back (response)

**In our project:**
When a teacher marks attendance, the app sends a request like:
```
POST https://sxs.aaramvashikshya.com/api/v1/attendance
{ studentId: "abc123", date: "2081-04-15", status: "PRESENT" }
```
The backend saves it to the database and replies:
```json
{ "success": true, "data": { "id": "xyz789", "status": "PRESENT" } }
```

**Why NestJS?**
NestJS is a framework that gives us structure — like a template for how to organize backend code.
Without it, you'd have to figure out the structure yourself. NestJS has already solved that.

---

## Concept 2 — What is a database? What is PostgreSQL?

**Plain English:**
A database is where all your data lives permanently.
Student names, fee records, attendance — all stored in a database.

PostgreSQL is like a very powerful Excel — but instead of one person using it,
thousands of people can read and write data at the same time, safely.

**Tables = Excel sheets.**
Our `students` table looks like this:

| id | first_name | last_name | date_of_birth | gender |
|----|-----------|-----------|--------------|--------|
| abc-123 | Ram | Sharma | 2010-04-15 | MALE |
| def-456 | Sita | Rai | 2011-06-20 | FEMALE |

**Why not just use Excel?**
- Excel can't handle 1000 people reading/writing at once
- Excel has no security (anyone can open it)
- Excel can't run code to validate data
- Excel can't connect to your app

---

## Concept 3 — What is multi-tenancy? (THE most important concept for this project)

**Plain English:**
Imagine you're running a building with 50 offices.
Each office (school) has their own locked room — only they can access their files.
You (Aaramva Shikshya) own the building and manage all the rooms.

Each school is a **tenant** — they rent space in your system.

**The problem without multi-tenancy:**
If St. Xavier's and Navodaya share the same `students` table,
a bug could accidentally show Xavier's student data to Navodaya. Disaster.

**How we solve it — schema-per-tenant:**
PostgreSQL has a concept called "schemas" — think of them as folders inside the database.

```
Database: aaramvashikshya_db
├── public/              ← shared area (just the list of schools)
│   └── tenants table   (school name, slug, subscription)
├── tenant_sxs/          ← St. Xavier's private folder
│   ├── students
│   ├── attendance
│   └── fees
└── tenant_navodaya/     ← Navodaya's private folder
    ├── students
    ├── attendance
    └── fees
```

When a Xavier's teacher logs in, ALL database queries automatically
go to `tenant_sxs` — it's impossible to accidentally read Navodaya's data.

**How the app knows which school is which:**
The subdomain! `sxs.aaramvashikshya.com` → slug is `sxs` → schema is `tenant_sxs`.

---

## Concept 4 — What is authentication? JWT tokens?

**Plain English:**
Authentication = proving you are who you say you are.

When a teacher logs in:
1. They send their email + password
2. The server checks: "Is this correct? Yes."
3. The server gives them a **token** (like a hotel key card)
4. Every future request, they show this key card
5. The server reads the key card: "Ah, this is Ram Sharma, a Teacher at Xavier's — let him in"

**JWT (JSON Web Token):**
The key card. It contains encoded information:
```
{ userId: "abc123", email: "ram@sxs.edu.np", role: "TEACHER", tenantSlug: "sxs" }
```
It's cryptographically signed — nobody can fake it or change the role to "PRINCIPAL".

**Why two tokens? (access + refresh)**
- Access token: Short-lived (15 minutes). Used for every request.
- Refresh token: Long-lived (7 days). Used only to get a new access token.

Why? If a hacker steals your access token, it expires in 15 minutes.
If they steal your refresh token... that's why we store it in a `httpOnly cookie`
(JavaScript on the page can't read it — makes it much harder to steal).

---

## Concept 5 — What is Prisma? What is an ORM?

**Plain English:**
Normally, to get data from a database you write SQL:
```sql
SELECT * FROM students WHERE id = 'abc123' AND deleted_at IS NULL;
```

An ORM (Object Relational Mapper) lets you write it like normal code instead:
```typescript
const student = await db.student.findFirst({
  where: { id: 'abc123', deletedAt: null }
});
```

**Prisma** is the ORM we use. It's popular, TypeScript-friendly, and safe.

**Why does this matter to you as a learner?**
You'll read Prisma code everywhere in this project.
When you see `await prisma.student.findMany({...})` — that's a database query.

**Schema file:**
Prisma has a `schema.prisma` file where you define your tables.
When you change it, you run `npx prisma migrate` to actually update the database.
Think of migrations like Git commits — a history of every database change.

---

## Concept 6 — What is NestJS? Modules, Controllers, Services

NestJS organizes code into three layers. Every feature follows this pattern:

```
CONTROLLER  ←  handles HTTP requests, validates input, calls service
    ↓
SERVICE     ←  contains business logic (the real code)
    ↓
DATABASE    ←  Prisma queries
```

**Real example — "Get list of students":**

```typescript
// Controller (apps/api/src/modules/student/student.controller.ts)
// This receives the HTTP request from the frontend
@Get()
@Roles(Role.TEACHER)
getStudents(@Query() query: PaginationDto) {
  return this.studentService.findAll(query);  // hand off to service
}

// Service (apps/api/src/modules/student/student.service.ts)
// This contains the actual logic
async findAll(query: PaginationDto) {
  const students = await this.db.query(
    `SELECT * FROM students WHERE deleted_at IS NULL LIMIT $1 OFFSET $2`,
    [query.limit, query.offset]
  );
  return students;
}
```

**Why split into controller + service?**
Because the service doesn't care HOW the request came in (HTTP, WebSocket, CLI...).
This makes the code testable and reusable.

---

## Concept 7 — What is Docker?

**Plain English:**
Your app needs PostgreSQL and Redis to run. But installing them on your computer
is annoying — different steps for Windows, Mac, Linux. And it might conflict with other projects.

Docker lets you run them in isolated "containers" — like little virtual machines,
but much lighter. You just run:
```bash
docker-compose up
```
And instantly you have PostgreSQL and Redis running, identical on every computer.

**You don't need to know Docker deeply right now.**
Just remember: `docker-compose up` starts your database. `docker-compose down` stops it.

---

## Concept 8 — What is TypeScript?

**Plain English:**
JavaScript is the language of the web. TypeScript is JavaScript with "types" added.

Types mean you tell the code what kind of data to expect:
```typescript
// Without types (JavaScript) — dangerous
function addStudent(data) {
  // data could be anything! A number? A string? Who knows?
}

// With types (TypeScript) — safe
function addStudent(data: CreateStudentDto) {
  // TypeScript GUARANTEES data has firstName, lastName, dateOfBirth, etc.
  // If you try to use data.wrongField — it's a compile error, caught before running
}
```

**Why does this matter for Aaramva Shikshya?**
In a school system, data integrity is critical. TypeScript prevents an entire class
of bugs before they ever reach your users.

---

## Your Learning Checkpoints

After each Claude Code session, answer these questions.
You don't need to write code — just explain in plain English. Come ask me if you're unsure.

### After Session 0 (BS Calendar)
- [ ] Can you explain what a "function" does in simple terms?
- [ ] Why do we store dates in AD and display in BS?
- [ ] What is a unit test and why do we write them?

### After Session 1 (Foundation)
- [ ] What is a "tenant" in this system?
- [ ] How does the app know which school a user belongs to?
- [ ] What happens step by step when a teacher logs in?
- [ ] What does "role-based access control" mean?

### After Session 2 (Student module)
- [ ] What is a database "relation"? (student → guardian)
- [ ] What is a "soft delete" and why don't we actually delete records?
- [ ] What is pagination and why do list endpoints need it?
- [ ] Why does the S3 upload use a "presigned URL" instead of going through our server?

### After Session 3+ (ongoing)
- [ ] Can you look at a controller method and describe what it does?
- [ ] Can you spot a missing `@Roles()` guard?
- [ ] Can you read an error message and have a guess at the cause?

---

## How to read error messages (the most important survival skill)

When something breaks, you'll see an error. Don't panic. Read it like this:

```
Error: Cannot read property 'findMany' of undefined
  at StudentService.findAll (student.service.ts:45)
```

Translation:
- **What broke:** Something called `findMany` on something that doesn't exist
- **Where:** Line 45 of `student.service.ts`
- **Likely cause:** The database service wasn't injected properly into StudentService

**My process for helping you debug:**
1. Paste the full error here
2. Paste the relevant file (the one mentioned in the error)
3. I'll explain what's wrong and give you the fix to paste into Claude Code

---

## Vocabulary quick-reference

| Word | What it means |
|------|--------------|
| API | The communication layer between frontend and backend |
| Endpoint | One specific URL that does one thing (e.g. POST /students) |
| Request | Data sent TO the server |
| Response | Data sent BACK from the server |
| Schema | A folder/namespace in PostgreSQL |
| Migration | A recorded change to the database structure |
| DTO | "Data Transfer Object" — defines the shape of input/output data |
| Guard | Code that runs before a controller to check permissions |
| Middleware | Code that runs on every request before it hits the controller |
| Decorator | The `@` things in TypeScript — they add behavior to functions/classes |
| Tenant | One school in our multi-school system |
| Slug | A URL-safe short name, e.g. "st-xaviers" or "sxs" |
| Soft delete | Setting `deletedAt` instead of actually deleting — keeps history |
| Pagination | Returning results in pages (20 at a time) instead of all at once |
| Seed | Fake data inserted into the DB for testing |
| Presigned URL | A temporary S3 link that allows a client to upload directly |
| JWT | A signed token that proves who you are |
| Hash | A one-way scramble of a password — you can verify but not reverse |
| RBAC | Role-Based Access Control — your role determines what you can do |

---

## When you feel stuck or confused

Come back here and ask me:
- "I don't understand what [X] is doing"
- "Claude Code wrote [Y] — is that correct?"
- "I got this error: [paste error]"
- "What should the next Claude Code prompt be?"
- "Is this the right approach or should we do it differently?"

There are no stupid questions. Every "I don't understand" is a learning opportunity.
You're building something real — that's already more than most people do.

---

## Session 20 — Mobile App Concepts

### Concept A — Why the access token lives in memory but the refresh token lives in SecureStore

**The short version:** Two tokens, two threat models, two storage locations.

**Access token (in-memory only):**
The access token is short-lived — it expires in 15 minutes. Its only job is to prove your identity on API calls made while you are actively using the app. Because the app is open and running, JavaScript memory is perfectly fine. When the app is killed (user swipes it away, phone restarts), memory is wiped — and the access token goes with it. That is the correct behavior, not a bug. If an attacker somehow dumps your app's memory mid-session, they get a token that will be useless in at most 15 minutes.

The dangerous alternative would be writing the access token to `AsyncStorage` (React Native's key-value file store) or to a file. Those are readable by anyone or anything with access to the device filesystem — a compromised device, a buggy third-party SDK, or forensic tools. Storing a credential in plaintext on disk gives an attacker permanent access until you manually revoke the token server-side.

**Refresh token (in SecureStore):**
The refresh token lasts 7 days. Its job is to get you a new access token when the old one expires — this is how you stay logged in across app launches without entering your password every morning. For this to work, the refresh token must survive the app being killed. It has to be written to persistent storage.

`expo-secure-store` uses the iOS Keychain (on iPhone) or Android Keystore (on Android). Both are OS-managed, hardware-backed encrypted storage. Even if someone extracts your phone's filesystem, the Keychain/Keystore entries are encrypted with keys tied to the device's secure enclave. Ordinary apps cannot read another app's SecureStore entries.

**The cost comparison:**
- Compromised refresh token (SecureStore breach): attacker has a session for up to 7 days. Serious, but bounded — and the server can revoke it.
- Compromised access token in plaintext on disk: attacker has permanent read access to your app data until you actively log out or the server detects abuse. Unbounded, and silent.

This two-layer design — fast in-memory access token, persisted encrypted refresh token — is the standard security pattern for mobile authentication.

---

### Concept B — What Metro `watchFolders` and `nodeModulesPaths` do, and why a monorepo needs them

**What is Metro?**
Metro is the JavaScript bundler that React Native and Expo use. It watches your files, bundles your code, and sends updates to your device when files change (hot reload). Think of it as the equivalent of webpack for web, but designed for React Native.

**The default behavior:**
By default Metro only watches the directory it is started in — which is `apps/mobile/`. It does not know that `packages/bs-calendar/` even exists.

**The monorepo problem:**
Our project is a monorepo: one repository with multiple packages. `apps/mobile/` imports from `packages/bs-calendar/`. When you edit a file in `packages/bs-calendar/`, Metro has no idea — so hot reload does not trigger, and you might even get stale cached code. Worse, when Metro's module resolver tries to find `bs-calendar`, it only looks inside `apps/mobile/node_modules/`, which does not have it.

**The fix — two Metro config settings:**

`watchFolders: [monorepoRoot]` tells Metro to watch the entire monorepo tree, not just the app folder. Now when you edit `packages/bs-calendar/src/index.ts`, Metro sees the change and hot-reloads.

`nodeModulesPaths: [path.join(monorepoRoot, 'node_modules')]` tells Metro's module resolver to also look in the root `node_modules/` when resolving imports. This is how `import { adToBs } from 'bs-calendar'` succeeds — Metro finds the package in root `node_modules` because you added it there.

**One more step for non-workspace monorepos:**
Our monorepo does not use npm/yarn workspaces (no `"workspaces"` field in the root `package.json`). That means npm will not automatically create a symlink from `apps/mobile/node_modules/bs-calendar` to `packages/bs-calendar/`. You have to declare the package as a `file:../../packages/bs-calendar` dependency in `apps/mobile/package.json` explicitly. Then when you run `npm install` inside `apps/mobile/`, npm copies or symlinks the local package into `apps/mobile/node_modules/bs-calendar/` so Metro can find it via the normal module resolution path.

**Summary in one sentence:** `watchFolders` makes hot-reload work for shared packages; `nodeModulesPaths` makes imports resolve; `file:` dependencies make npm wire the local package in.

---

### Concept C — How the 401 interceptor queue + refresh works, and why the refresh call must bypass the interceptor

**The problem:**
JWTs expire. When the access token expires, the server returns `401 Unauthorized`. This can happen in the middle of a user doing something — they tap a button, several API calls fire simultaneously, and all of them get 401 back. You need to:
1. Silently get a new access token (refresh)
2. Retry all the failed requests with the new token
3. Never show a login screen unless the refresh itself fails

**The queue pattern:**

When the first 401 arrives, the response interceptor (in `lib/api.ts`) starts a refresh and sets `isRefreshing = true`. The refresh returns a `Promise`. The interceptor stores this promise.

Meanwhile, if five other requests also return 401 while the refresh is still in flight, they would all try to start their own refresh too — causing five simultaneous `/auth/refresh` calls, all racing, potentially creating chaos. The queue prevents this: instead of starting another refresh, each subsequent 401 pushes the request's `resolve` and `reject` functions onto a `failedQueue` array and returns a new promise. These requests just wait.

When the refresh succeeds and the new access token comes back, the interceptor drains the queue: it calls every stored `resolve` with the new token, so all the waiting requests retry immediately with the new token, as if the expiry never happened.

If the refresh fails (the refresh token itself is expired or revoked), the interceptor calls every stored `reject`, all waiting requests fail, and the user is logged out.

**Why the refresh call must bypass the interceptor:**

The refresh request goes to `POST /auth/refresh`. If this call goes through the same interceptor, and the refresh endpoint returns 401 (because the refresh token is also invalid), the interceptor will try to refresh again — which calls `POST /auth/refresh` again — which might return 401 again — and so on forever. Infinite recursion, or at best a stack overflow.

The fix is to use a separate axios instance called `rawApi` that has no interceptors attached. The refresh call is made with `rawApi.post('/auth/refresh', ...)`. If this returns 401, `rawApi` just returns that 401 error normally. The regular interceptor never sees it. The calling code handles it by logging the user out.

**In plain English:** The queue means "wait for one refresh, then everyone goes at once." The raw instance means "the refresh call is not allowed to trigger another refresh."

---

### Concept D — Why push registration is fire-and-forget, and why it won't work in Expo Go

**What is Expo Go?**
Expo Go is a free app you install from the App Store or Play Store. It lets you run your React Native/Expo project without building a full native app. You scan a QR code and your JavaScript bundle loads inside Expo Go. This is great for rapid development — no 10-minute build cycle every time you change code.

**What are Expo Push Notifications?**
Expo provides a push notification service. Your backend sends a push request to Expo's servers, Expo forwards it to Apple (APNs) or Google (FCM), and it shows up on the device. For your app to receive pushes, Expo needs to issue it an **Expo Push Token** — a unique address for that specific app installation on that specific device.

**Why `getExpoPushTokenAsync()` fails in Expo Go:**
Getting a push token requires Expo to register your app with its push service. This registration is tied to an `experienceId` or `projectId` — an identifier that is specific to *your* app in Expo's system, configured via EAS (Expo Application Services) and stored in `app.json` as `extra.eas.projectId`.

Expo Go is its own app with its own `projectId`. When your code runs inside Expo Go and calls `getExpoPushTokenAsync({ projectId: 'YOUR_PROJECT_ID' })`, Expo's native module sees that the running native app (Expo Go) does not match your project ID — so it throws an error. This is intentional: Expo Go can only generate push tokens for its own project, not for yours.

Additionally, on Android, Expo Push Notifications internally use FCM (Firebase Cloud Messaging). The FCM configuration (your `google-services.json`) is baked into the native build. Expo Go uses its own FCM configuration, not yours.

**Why fire-and-forget (`.catch(console.warn)`) is the right pattern here:**
The login flow should always succeed. Push token registration is a "nice to have" — if it works, backend gets the token and can send push notifications to this device. If it fails (which it always will in Expo Go during development, and might occasionally fail on real devices due to network issues or revoked permissions), the user should still be logged in.

Using `.catch(console.warn)` means: try to register, and if anything goes wrong, print a warning in the developer console and move on. The failure is not surfaced to the user as an error. This is called "fire-and-forget" — you fire the request and do not wait for or depend on the result.

**To make push notifications actually work:**
1. Set up EAS: `eas build:configure` to generate a `projectId`
2. Add `EXPO_PUBLIC_PROJECT_ID=your-eas-project-id` to `apps/mobile/.env`
3. Build a development build or production build (not Expo Go): `eas build --profile development`
4. Run that native build on your device — push tokens will work

---

## Session 21 — IDOR vulnerabilities and timezone-aware "today"

### Concept E — What is an IDOR and why does it matter?

**What does IDOR stand for?**
Insecure Direct Object Reference. It's a type of security vulnerability where a client can access or modify data belonging to another user by supplying a different ID.

**A concrete example from this codebase:**
Before Session 20.5, the "apply leave" endpoint (`POST /attendance/leave`) accepted a `studentId` in the request body. The intent was: the caller says "file leave for student X." But the endpoint didn't check whether the caller *is* student X or is related to student X. Any STUDENT user with a valid login token could put any other student's UUID in the body and file leave on their behalf. That's an IDOR — the `studentId` is a "direct reference to an object" and access was not properly restricted.

**How it was fixed:**
When the caller role is `STUDENT`, the server now ignores any `studentId` in the body entirely. Instead it runs:
```sql
SELECT id FROM students WHERE user_id = $1 AND deleted_at IS NULL
```
where `$1` is the `userId` from the JWT token. The token cannot be forged (it's signed with a secret only the server knows), so this lookup always returns *the caller's own student record*. The client never gets to choose which student record is affected.

When the caller is `PARENT`, a different check applies: the parent can only file leave for students where their user account appears in the `guardians` table (`guardians.user_id = parent_user_id`). Supplying a studentId not in their guardian list returns 403.

**The general rule:** For any action that affects a specific resource, derive the resource identity from the authenticated token on the server — never trust an ID supplied by the client without verifying ownership.

**The /students/me endpoints follow the same principle:**
`GET /students/me` does not accept a `studentId` query param. It always resolves:
`token.userId → students.user_id → student row`. A STUDENT user physically cannot see another student's profile or attendance through these endpoints.

---

### Concept F — Why "today" must be timezone-aware in Nepal

**The problem with `new Date()` in a Node.js server:**
Node.js runs on UTC by default. `new Date()` gives you the current UTC time. Nepal is UTC+05:45 — five hours and forty-five minutes ahead. That means:

- At 11:00 PM UTC, it is already 4:45 AM the *next day* in Nepal.
- At 6:00 AM UTC on a Sunday, it is already 11:45 AM on Sunday in Nepal.

If you wrote `new Date().toISOString().split('T')[0]` on the server to get "today's date" and your server clock is UTC, you'd get the wrong date in Nepal for a 5:45-hour window every night.

**This matters for the timetable endpoint:**
`GET /students/me/timetable/today` returns the student's class schedule for *today*. "Today" must mean today in Nepal, not today in UTC. If the school server ran this in UTC, at 11 PM Nepal time (5:15 PM UTC) a student would still see Saturday's timetable even though it's already 11 PM Saturday in Nepal and Sunday school starts in 7 hours.

**The fix — `todayInNepal()` in `student-me.service.ts`:**
```typescript
const NEPAL_OFFSET_MS = 345 * 60 * 1000;  // 345 minutes = 5h45m

export function todayInNepal(): { dateAd: string; dayOfWeek: number } {
  const nowNepal = new Date(Date.now() + NEPAL_OFFSET_MS);
  const dateAd = nowNepal.toISOString().split('T')[0];
  const dayOfWeek = nowNepal.getUTCDay();
  return { dateAd, dayOfWeek };
}
```

`Date.now() + NEPAL_OFFSET_MS` shifts the UTC timestamp to Nepal local time. Then `.toISOString()` formats it as if it were UTC, but since we already added the offset, the date portion reflects Nepal's current date. `.getUTCDay()` returns the day of week (0=Sunday, 6=Saturday) in that adjusted time — which is the Nepal local day.

**Why `Date.now()` instead of `new Date()`?**
`new Date()` cannot be easily mocked in Jest — it creates a real Date object. `Date.now()` is a static method that can be intercepted with `jest.spyOn(Date, 'now').mockReturnValue(timestamp)`. This lets unit tests simulate any point in time, including the exact Nepal midnight boundary (2026-06-13T18:15:00Z), without needing to run the test at that exact moment.

**School week in Nepal:**
Nepal schools run Sunday through Friday. Saturday is the weekly holiday. So the timetable endpoint returns `isSchoolDay: false` when `dayOfWeek === 6` (Saturday in Nepal), without even querying the database.

---

## Session 22 — Student Mobile Screens (Dashboard + Attendance Calendar)

### Concept A — Building a BS-month calendar grid when the package has no "days-in-month" helper (and what to do when it does)

The spec said: *if there is NO `daysInBsMonth` export, derive month length via AD date-diff: diff between `bsToAd(y, m, 1)` and `bsToAd(y, m+1, 1)`.* Before writing any code, we read the actual package exports and found `daysInBsMonth` already exists. The lesson: **always read before assuming**. The fallback technique is still worth understanding:

**The AD-date-diff trick (for reference, in case a future package doesn't export this):**
```typescript
const firstOfMonth = bsToAd({ year, month, day: 1 });
const firstOfNext  = month === 12
  ? bsToAd({ year: year + 1, month: 1, day: 1 })
  : bsToAd({ year, month: month + 1, day: 1 });
const days = Math.round(
  (firstOfNext.getTime() - firstOfMonth.getTime()) / 86400000
);
```
Because BS calendar month lengths are irregular (28–32 days, not a fixed pattern), you cannot use a formula. Converting to AD and measuring the gap gives the exact count. Handle the Chaitra→Baishakh year-rollover by checking `month === 12`.

**The actual calendar grid algorithm (what we used):**
```typescript
const daysInMonth = daysInBsMonth(year, month);         // e.g. 31
const firstAd     = bsToAd({ year, month, day: 1 });
const weekdayOfFirst = firstAd.getDay();                // 0=Sun … 6=Sat

// Build cell array: leading blanks then day numbers
const cells: (number | null)[] = [
  ...Array(weekdayOfFirst).fill(null),                  // blank slots
  ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
];

// Render in rows of 7 (Nepal week is Sun–Sat)
for (let i = 0; i < cells.length; i += 7) {
  const row = cells.slice(i, i + 7);
  // render each cell
}
```

`getDay()` on a JavaScript `Date` returns 0=Sunday, which matches Nepal's Sunday-first week — no offset adjustment needed.

**Today's cell**: compare the cell's `{ year, month, day }` against `todayBs()` and add a green border.

**Saturday column (index 6)**: style with amber background/text to mark the weekend, regardless of whether there is attendance data.

---

### Concept B — Why "view attendance by BS month" requires converting month bounds to an AD date range before querying

The API stores all dates in **AD ISO format** (`dateAd: "2026-04-14"`). The query endpoint is:
```
GET /students/me/attendance/history?fromDate=2026-04-14&toDate=2026-05-13
```

The user is browsing a **BS month** — say Baisakh 2083. But the server knows nothing about BS months; it filters rows by their `dateAd` column. So we must translate the BS month boundaries into the equivalent AD start and end dates:

```typescript
const fromAd = bsToAd({ year, month, day: 1 });          // first day of BS month → AD

const nextBs = month === 12
  ? { year: year + 1, month: 1, day: 1 }                  // Chaitra → Baisakh next year
  : { year, month: month + 1, day: 1 };
const toAdRaw = bsToAd(nextBs);
toAdRaw.setDate(toAdRaw.getDate() - 1);                   // one day before next month's first day

const fromDate = fromAd.toISOString().split('T')[0];      // "2026-04-14"
const toDate   = toAdRaw.toISOString().split('T')[0];     // "2026-05-13"
```

This pattern applies everywhere you need to filter server data by a BS period: convert the BS period boundaries to AD, pass them as query params, and convert individual record dates back to BS at display time.

**Why not just fetch everything and filter client-side?**
A student might have 200+ attendance records across a year. Fetching all of them for a single month view wastes bandwidth and makes the screen slow. The `fromDate`/`toDate` filter lets the server return only the ~30 records that matter.

**The response extraction discipline:**
The attendance history endpoint is paginated (`ResponseInterceptor` wraps in `{ success, data }` and the service adds `{ data: [], meta: {} }` inside), so the full path is:
- `response.data` → `{ success: true, data: { data: [...], meta: {} } }`
- `response.data.data` → `{ data: [...], meta: {} }`  ← this is what the hook returns
- `hook.data?.data ?? []` → the actual array of attendance records

Getting this wrong (using `hook.data` directly instead of `hook.data?.data`) returns the `{ data, meta }` wrapper object, not the array — which is the class of bug that has appeared before in the web app.
