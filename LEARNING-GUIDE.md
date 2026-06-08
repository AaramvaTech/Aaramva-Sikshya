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
