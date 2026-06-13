# Session 19 — Backend Prep for Mobile

**Scope:** Make the existing NestJS API mobile-ready. No mobile code in this session.
**Modules touched:** Auth, Tenants (public), Communication, Student.
**Out of scope:** Push *sending* (Session 24), payment gateways, any Expo code.

---

## Part 1 — Mobile-aware auth flow

### Problem

The current refresh flow stores the refresh token in an httpOnly cookie. React Native has no reliable cookie jar, so mobile clients need the refresh token in the **response body**, which they will store in the OS keychain via `expo-secure-store`. Web behavior must remain byte-for-byte unchanged.

### Mechanism: the `X-Client-Type` header

Mobile clients send `X-Client-Type: mobile` on auth requests. Absence of the header (or any other value) means web behavior.

### 1.1 `POST /api/v1/auth/login` (modified)

**Request:** unchanged (`{ email, password }` + `X-Tenant-Slug` header).

**Behavior change:**

| Client | Refresh token delivery |
|---|---|
| Web (no header) | httpOnly cookie — unchanged |
| `X-Client-Type: mobile` | In response body; **no cookie is set** |

**Mobile response:**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "user": { "id": "...", "email": "...", "role": "STUDENT", "firstName": "...", "lastName": "..." }
  }
}
```

Server-side refresh-token storage (hashing, expiry, rotation tracking) is identical for both client types — only the *delivery channel* differs.

### 1.2 `POST /api/v1/auth/refresh` (modified)

**Token source resolution, in order:**
1. If `X-Client-Type: mobile` → read `refreshToken` from JSON body. If missing → `401`.
2. Otherwise → read cookie (existing behavior, unchanged).

**Mobile request body:** `{ "refreshToken": "eyJ..." }`

**Mobile response:** new `accessToken` **and** new `refreshToken` in body (rotation: the old refresh token is revoked exactly as it is for web). Web response unchanged.

**Edge case to test explicitly:** a request that carries *both* a valid cookie and a mobile header with body token must use the body token only. Never silently fall back from body → cookie on mobile; a missing body token is a hard 401.

### 1.3 `POST /api/v1/auth/logout` (modified)

- Web: unchanged (reads cookie, revokes, clears cookie).
- Mobile: body `{ "refreshToken": "...", "expoPushToken": "..." (optional) }`. Revoke the refresh token; if `expoPushToken` is provided and belongs to this user, delete that device token record (see Part 3).

### 1.4 DTOs

```ts
// refresh-mobile.dto.ts
export class MobileRefreshDto {
  @IsString() @IsNotEmpty()
  refreshToken: string;
}

// logout-mobile.dto.ts
export class MobileLogoutDto {
  @IsString() @IsNotEmpty()
  refreshToken: string;

  @IsString() @IsOptional()
  expoPushToken?: string;
}
```

Implementation note: prefer a small `ClientType` decorator (`@ClientType()` param decorator reading the header) over sprinkling `req.headers['x-client-type']` through the service layer. Services should receive `clientType: 'web' | 'mobile'` as a plain argument so unit tests don't need to mock requests.

---

## Part 2 — Public tenant verification

### Why

Mobile has no subdomain. The app's first screen asks for a school code (the tenant slug); we need a public endpoint to confirm it and fetch display info (school name + logo) before showing the login form.

### 2.1 `GET /api/v1/tenants/verify/:slug` (new, public)

- **No auth, no `X-Tenant-Slug` header.** Reads the platform-level school registry in the public schema — this endpoint must NOT go through tenant middleware.
- Slug is normalized to lowercase before lookup.

**200 — slug exists AND school status is ACTIVE:**

```json
{
  "success": true,
  "data": {
    "slug": "sunrise-ktm",
    "name": "Sunrise Secondary School",
    "logoUrl": "https://...",   // null if none
    "address": "Kathmandu"      // null if none
  }
}
```

**404 — everything else.** Nonexistent, suspended, and soft-deleted schools all return the *same* 404 with a generic message ("School not found"). Do not distinguish suspended from nonexistent — that leaks platform business information to unauthenticated callers.

**Rate limiting:** `@Throttle({ default: { limit: 10, ttl: 60000 } })` (10/min per IP) via `@nestjs/throttler`. This endpoint is enumerable by design; throttling makes slug-scanning impractical.

---

## Part 3 — Device token registry

### Why

Session 24 will send push notifications via Expo's push service. That requires knowing each user's device tokens *now*, so the mobile app can register them from day one and we accumulate tokens before push ships.

### 3.1 Prisma model (tenant schema)

```prisma
model DeviceToken {
  id         String         @id @default(uuid())
  userId     String
  token      String         @unique          // "ExponentPushToken[xxxx]"
  platform   DevicePlatform
  deviceName String?                          // "Samsung Galaxy A52"
  lastSeenAt DateTime       @default(now())
  createdAt  DateTime       @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@map("device_tokens")
}

enum DevicePlatform {
  ANDROID
  IOS
}
```

> **Deliberate convention exception:** no `deletedAt`. Device tokens are infrastructure, not records — a stale token causes failed push sends and has zero audit value. Hard delete. Document this exception in `CLAUDE.md` so future sessions don't "fix" it.

### 3.2 `POST /api/v1/communication/devices` (new, any authenticated role)

**Body:**

```json
{ "token": "ExponentPushToken[abc123]", "platform": "ANDROID", "deviceName": "Pixel 7" }
```

**Validation:** token must match `/^ExponentPushToken\[.+\]$/`; platform must be a valid enum value.

**Behavior — upsert by `token`:**
- Token not in table → create for current user.
- Token exists for the **same user** → update `lastSeenAt`, `platform`, `deviceName`.
- Token exists for a **different user** → reassign to current user (update `userId` + `lastSeenAt`).

The reassignment case is not an edge case in Nepal: one family phone shared by two siblings, or a parent logging in after a student on the same device. The device is identified by its token; whoever is logged in *now* owns it.

**Response:** `{ success: true, data: <DeviceToken> }`

Call pattern (for Session 20's reference): the app registers on every successful login and on app foreground if the token changed.

### 3.3 `DELETE /api/v1/communication/devices/:token` (new)

Deletes only if the token belongs to the current user; otherwise `404` (not `403` — don't confirm the token exists under someone else). Returns `{ success: true, data: null }`.

---

## Part 4 — Parent ↔ children linkage

### Current gap

Guardians exist as rows attached to students, but nothing connects a Guardian to a login-capable User with the PARENT role. Without that link, a parent can authenticate but the API can't answer "whose parent are you?"

### 4.1 Migration — link Guardian to User

```prisma
model Guardian {
  // ...existing fields...
  userId String?            // nullable: most guardians never get accounts

  user User? @relation(fields: [userId], references: [id])

  @@index([userId])
}
```

`userId` is **indexed, not unique** — one parent user account links to multiple Guardian rows (one per child, possibly with different relations: father of student A, uncle/guardian of student B).

### 4.2 `POST /api/v1/students/:studentId/guardians/:guardianId/account` (new, admin-side)

Creates a login account for an existing guardian and links it. Roles: `SCHOOL_OWNER`, `PRINCIPAL`, `ACADEMIC_COORDINATOR`.

**Body:** `{ "email": "...", "password": "..." }` *(school staff sets initial password and communicates it; self-service password reset is a later concern)*

**Behavior:**
- Guardian already has `userId` → `409 Conflict`.
- Email already belongs to an existing user **with PARENT role** → link that user to this guardian instead of creating a new one (second child case). Email belongs to a non-PARENT user → `409`.
- Otherwise → create User with role `PARENT`, set `guardian.userId`.

**Response:** `{ success: true, data: { userId, guardianId, email, linked: true } }`

### 4.3 `GET /api/v1/students/my-children` (new, PARENT role only)

Returns all students where any Guardian row has `userId = currentUser.id`. Excludes soft-deleted students.

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "admissionNumber": "2082-0043",
      "firstName": "Aarav",
      "lastName": "Shrestha",
      "photoUrl": null,
      "relation": "FATHER",
      "currentEnrollment": {
        "className": "Class 8",
        "sectionName": "B",
        "rollNumber": 12
      }
    }
  ]
}
```

Simple list shape (`data: [...]`), not paginated — no parent has enough children to paginate. `currentEnrollment` is `null` if the student has no enrollment in the current academic year (flatten to the same shape the web frontend's enrollment fix established — names, not nested objects).

---

## Test plan (unit, matching existing patterns)

**Auth:**
1. Login with mobile header → refresh token in body, no `Set-Cookie` header
2. Login without header → cookie set, no refresh token in body (regression)
3. Refresh with mobile header + body token → rotates, returns both tokens in body
4. Refresh with mobile header, missing body token, valid cookie present → 401 (no fallback)
5. Refresh without header → cookie path unchanged (regression)
6. Logout (mobile) revokes token; with `expoPushToken` also deletes the device row

**Tenants:**
7. Verify active slug → 200 with name/logo
8. Verify suspended slug → 404, same body as nonexistent slug
9. Verify uppercase input of valid slug → 200 (normalization)

**Devices:**
10. Register new token → created for current user
11. Re-register same token, same user → `lastSeenAt` updated, no duplicate row
12. Register token previously owned by another user → reassigned
13. Invalid token format → 400
14. Delete own token → gone; delete someone else's token → 404

**Parents:**
15. Create account for guardian → User with PARENT role created, linked
16. Create account when guardian already linked → 409
17. Create account with email of existing PARENT user → links, no new user
18. `my-children` returns only linked students, excludes soft-deleted
19. `my-children` as TEACHER role → 403

---

## Acceptance checklist

- [ ] Web login/refresh/logout behavior verified unchanged (run the web app against it)
- [ ] All 4 parts implemented with DTOs + validation
- [ ] ~19 new unit tests passing (target: 183+ total)
- [ ] `CLAUDE.md` updated: `X-Client-Type` convention, DeviceToken hard-delete exception, Guardian.userId linkage
- [ ] No tenant middleware applied to `/api/v1/tenants/verify/:slug`
