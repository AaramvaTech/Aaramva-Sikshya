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
