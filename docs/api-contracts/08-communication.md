# Communication Module — Claude Code Session 8 Spec
# Aaramva Shikshya

## Prerequisites
- Sessions 0–7 complete, 108 tests passing
- EventEmitterModule registered in AppModule
- Events already being emitted:
  - 'attendance.absent' → { tenantSlug, date, absentStudents: [{studentId, studentName, parentPhone}] }
  - 'payment.received' → { studentId, amount, invoiceId, tenantSlug }
  - 'invoice.overdue'  → { studentId, invoiceId, balance, tenantSlug }

## Goal
Build the Communication module:
- Notice board (school-wide and class-specific announcements)
- SMS sending via Sparrow SMS (Nepal's most common SMS provider)
- In-app notifications (stored, fetchable — push will come with mobile app)
- Event listeners that wire up to attendance/finance events
- Bulk SMS for school communications

This is the "glue" module — it connects to everything else via events.

---

## Sparrow SMS — Nepal's SMS provider

API docs: https://sparrowsms.com/
Endpoint: POST https://api.sparrowsms.com/v2/sms/
Headers: { Authorization: 'Bearer {token}' }
Body: { from: 'YourBrandName', to: '977XXXXXXXXXX', text: 'message' }
Response: { response_code: 200, success: 1, error: null }

Nepal phone numbers:
- Always prefix with 977 for international format
- Strip leading 0 if present: 0984... → 977984...
- Validate: must be 10 digits starting with 97 or 98 (Ncell/NTC)

For local development: use a mock SMS service that logs to console
and returns fake success. Toggle with SPARROW_SMS_ENABLED=false env var.

---

## Database — add to tenant-schema.sql

```sql
-- ─── NOTICE BOARD ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notices (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        VARCHAR(200) NOT NULL,
  body         TEXT        NOT NULL,
  type         VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
                           -- GENERAL | EXAM | FEE | HOLIDAY | EVENT | URGENT
  audience     VARCHAR(20) NOT NULL DEFAULT 'ALL',
                           -- ALL | TEACHERS | PARENTS | STUDENTS | CLASS
  class_id     UUID        REFERENCES classes(id),   -- if audience = CLASS
  is_published BOOLEAN     NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,                          -- auto-hide after this date
  created_by   UUID        NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

-- ─── SMS LOG ──────────────────────────────────────────────────────────────────
-- Every SMS sent is logged (for audit + retry)
CREATE TABLE IF NOT EXISTS sms_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  to_number    VARCHAR(20) NOT NULL,
  message      TEXT        NOT NULL,
  trigger      VARCHAR(50) NOT NULL,    -- 'ATTENDANCE_ABSENT' | 'FEE_DUE' | 'MANUAL' | etc.
  status       VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                           -- PENDING | SENT | FAILED | MOCK
  provider_ref VARCHAR(100),            -- Sparrow SMS response reference
  error_message TEXT,
  student_id   UUID        REFERENCES students(id),
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_student   ON sms_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_status    ON sms_logs(status, created_at);

-- ─── IN-APP NOTIFICATIONS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id),
  title        VARCHAR(200) NOT NULL,
  body         TEXT        NOT NULL,
  type         VARCHAR(30) NOT NULL,    -- 'ATTENDANCE' | 'FEE' | 'EXAM' | 'NOTICE' | 'GENERAL'
  is_read      BOOLEAN     NOT NULL DEFAULT false,
  read_at      TIMESTAMPTZ,
  data         JSONB,                  -- extra payload e.g. { invoiceId, studentId }
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
```

---

## API Endpoints

### Notices

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /communication/notices | TEACHER+ | Create notice |
| GET | /communication/notices | All authenticated | List (filter by audience/type) |
| GET | /communication/notices/:id | All authenticated | Detail |
| PATCH | /communication/notices/:id | Creator or PRINCIPAL+ | Update |
| PATCH | /communication/notices/:id/publish | PRINCIPAL+ | Publish notice |
| DELETE | /communication/notices/:id | PRINCIPAL+ | Soft delete |

### SMS

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /communication/sms/send | PRINCIPAL, ACCOUNTANT | Send manual SMS |
| POST | /communication/sms/bulk | PRINCIPAL+ | Bulk SMS to a group |
| GET | /communication/sms/logs | PRINCIPAL+ | SMS log (paginated) |
| POST | /communication/sms/retry/:id | PRINCIPAL+ | Retry a failed SMS |

### Notifications

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| GET | /communication/notifications | All authenticated | Own notifications (paginated) |
| GET | /communication/notifications/unread-count | All authenticated | Badge count |
| PATCH | /communication/notifications/:id/read | All authenticated | Mark as read |
| PATCH | /communication/notifications/read-all | All authenticated | Mark all as read |

---

## Key DTOs

```typescript
// CreateNoticeDto
{
  title: string;          // max 200 chars
  body: string;
  type?: 'GENERAL' | 'EXAM' | 'FEE' | 'HOLIDAY' | 'EVENT' | 'URGENT';
  audience?: 'ALL' | 'TEACHERS' | 'PARENTS' | 'STUDENTS' | 'CLASS';
  classId?: string;       // required if audience = CLASS
  expiresAt?: string;     // ISO datetime (AD)
}

// SendSmsDto
{
  toNumber: string;       // Nepal format: 9841234567 or 977841234567
  message: string;        // max 160 chars for single SMS
  studentId?: string;     // for audit linkage
}

// BulkSmsDto
{
  audience: 'CLASS' | 'SECTION' | 'ALL_PARENTS' | 'ALL_TEACHERS' | 'CUSTOM';
  classId?: string;
  sectionId?: string;
  customNumbers?: string[];  // for CUSTOM audience
  message: string;
  trigger?: string;       // for SMS log audit trail
}
```

---

## Business logic rules

### 1. Nepal phone number normalisation
```typescript
function normaliseNepalPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');        // strip non-digits
  if (digits.startsWith('977') && digits.length === 13) return digits;
  if (digits.startsWith('0') && digits.length === 10) return '977' + digits.slice(1);
  if (digits.length === 10 && (digits.startsWith('97') || digits.startsWith('98'))) {
    return '977' + digits;
  }
  return null;  // invalid
}
```

### 2. SmsService.send() — the core method
```typescript
async send(to: string, message: string, trigger: string, studentId?: string): Promise<void> {
  const normalised = normaliseNepalPhone(to);
  if (!normalised) throw new BadRequestException(`Invalid Nepal phone: ${to}`);

  // 1. Insert sms_logs record with status = PENDING
  const logId = await this.db.insertSmsLog({ to: normalised, message, trigger, studentId });

  if (process.env.SPARROW_SMS_ENABLED !== 'true') {
    // Mock mode — log to console, update status to MOCK
    console.log(`[SMS MOCK] To: ${normalised} | ${message}`);
    await this.db.updateSmsLog(logId, { status: 'MOCK' });
    return;
  }

  // 2. Call Sparrow SMS API
  try {
    const resp = await fetch('https://api.sparrowsms.com/v2/sms/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SPARROW_SMS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.SPARROW_SMS_SENDER, to: normalised, text: message })
    });
    const data = await resp.json();
    if (data.response_code === 200) {
      await this.db.updateSmsLog(logId, { status: 'SENT', providerRef: String(data.uid), sentAt: new Date() });
    } else {
      await this.db.updateSmsLog(logId, { status: 'FAILED', errorMessage: data.error });
    }
  } catch (err) {
    await this.db.updateSmsLog(logId, { status: 'FAILED', errorMessage: err.message });
  }
}
```

### 3. Bulk SMS — collect numbers then send
```typescript
// For BulkSmsDto with audience = CLASS:
// SELECT guardians.phone FROM guardians
// JOIN students ON students.id = guardians.student_id
// JOIN enrollments ON enrollments.student_id = students.id
// WHERE enrollments.class_id = $classId
//   AND enrollments.academic_year_id = (current year)
//   AND guardians.is_primary = true
//   AND students.deleted_at IS NULL

// Then call this.smsService.send() for each unique phone number
// Don't send duplicate numbers (use Set to deduplicate)
// Return: { sent: N, failed: N, skipped: N (duplicates) }
```

### 4. Event listeners — wire up previously emitted events

```typescript
// apps/api/src/modules/communication/listeners/attendance.listener.ts
@Injectable()
export class AttendanceListener {
  @OnEvent('attendance.absent')
  async handleAbsent(payload: AttendanceAbsentEvent) {
    for (const student of payload.absentStudents) {
      if (!student.parentPhone) continue;
      const message = `Dear Parent, ${student.studentName} was absent on ${payload.date}. Please contact school.`;
      await this.smsService.send(student.parentPhone, message, 'ATTENDANCE_ABSENT', student.studentId);
    }
  }
}

// apps/api/src/modules/communication/listeners/finance.listener.ts
@Injectable()
export class FinanceListener {
  @OnEvent('payment.received')
  async handlePayment(payload: PaymentReceivedEvent) {
    // Create in-app notification for parent user linked to student
    // (Parent user may not exist yet — check before inserting)
  }

  @OnEvent('invoice.overdue')
  async handleOverdue(payload: InvoiceOverdueEvent) {
    // Send SMS to primary guardian: "Fee of Rs. X is overdue. Please pay."
    // Also create in-app notification
  }
}
```

### 5. Notice visibility rules
- `audience = ALL` → visible to all users in the tenant
- `audience = TEACHERS` → visible to TEACHER role and above
- `audience = PARENTS` → visible to PARENT role only
- `audience = STUDENTS` → visible to STUDENT role only
- `audience = CLASS` → visible to students/parents enrolled in that class
- `is_published = false` → visible only to PRINCIPAL+ (drafts)
- `expires_at < NOW()` → excluded from list results automatically

### 6. Notification creation helper
```typescript
async createNotification(userId: string, title: string, body: string, type: string, data?: object) {
  await this.db.$executeRaw`
    INSERT INTO notifications (user_id, title, body, type, data)
    VALUES (${userId}, ${title}, ${body}, ${type}, ${JSON.stringify(data ?? {})})
  `;
}
```
Use this wherever in-app notifications should be created.

### 7. SMS message templates (Nepal-friendly, concise)
```typescript
const SMS_TEMPLATES = {
  ATTENDANCE_ABSENT: (name: string, date: string) =>
    `Aaramva Shikshya: ${name} was absent on ${date}. Contact school for details.`,

  FEE_OVERDUE: (name: string, amount: number) =>
    `Aaramva Shikshya: Fee of Rs.${amount} is overdue for ${name}. Please pay at the earliest.`,

  FEE_RECEIVED: (name: string, amount: number) =>
    `Aaramva Shikshya: Rs.${amount} received for ${name}. Thank you.`,

  EXAM_REMINDER: (className: string, subject: string, date: string) =>
    `Aaramva Shikshya: Exam reminder - ${className} ${subject} exam on ${date}.`,
};
```

---

## Tests to write

```typescript
// SmsService
- normaliseNepalPhone normalises '0984...' to '977984...'
- normaliseNepalPhone accepts '977984...' as-is
- normaliseNepalPhone returns null for invalid numbers
- send() logs to sms_logs with status PENDING before sending
- send() updates status to MOCK when SPARROW_SMS_ENABLED=false
- send() updates status to FAILED when API returns error

// BulkSmsService
- bulkSms collects unique guardian phones for a class
- bulkSms deduplicates phone numbers (one guardian, two students)
- bulkSms returns correct { sent, failed, skipped } counts

// NoticeService
- createNotice sets is_published=false by default
- publishNotice sets published_at to now
- getNotices filters expired notices automatically
- getNotices filters by audience correctly

// NotificationService
- createNotification inserts record for correct user
- markAsRead sets is_read=true and read_at timestamp
- getUnreadCount returns correct count

// AttendanceListener (integration-style test with mocked SmsService)
- handleAbsent calls smsService.send for each absent student
- handleAbsent skips students with no parentPhone
```

---

## Exact prompt for Claude Code

```
Read CLAUDE.md in full. Confirm you have read it.
Then read docs/api-contracts/08-communication.md in full.

Sessions 0–7 complete. 108 tests passing.
EventEmitterModule is registered in AppModule.
The following events are already being emitted by other modules:
  - 'attendance.absent' from StudentAttendanceService
  - 'payment.received' from PaymentService
  - 'invoice.overdue' from RecalculateFinesJob

Session 8 task: Build the Communication module.

Work in this order:

1. Add 3 tables to tenant-schema.sql with IF NOT EXISTS:
   notices, sms_logs, notifications

2. Add to .env.example:
   SPARROW_SMS_ENABLED=false
   SPARROW_SMS_TOKEN=your_token_here
   SPARROW_SMS_SENDER=AaramvaS

3. Build SmsService:
   - normaliseNepalPhone() utility (pure function, easy to test)
   - send() — log PENDING → call Sparrow or mock → update status
   - bulkSend() — collect numbers by audience type, deduplicate, send each
   - retrySms() — reload FAILED log record and retry

4. Build NoticeService:
   - createNotice(), publishNotice(), getNotices() with visibility rules
   - getNotices filters: expired notices excluded, audience-based filtering

5. Build NotificationService:
   - createNotification() helper
   - getMyNotifications() (own user only, paginated)
   - getUnreadCount()
   - markAsRead(), markAllAsRead()

6. Build event listeners:
   - AttendanceListener — @OnEvent('attendance.absent') → SMS per absent student
   - FinanceListener:
     - @OnEvent('payment.received') → in-app notification
     - @OnEvent('invoice.overdue') → SMS + in-app notification
   Register listeners in CommunicationModule.

7. Wire CommunicationController with all endpoints + @Roles() guards.
   Mount under /communication.

8. Write all tests from spec.
   For listener tests, mock SmsService and NotificationService.
   Run full suite. Target: 108 existing + ~14 new = 122+ passing.

Rules (same as always):
- TenantPrismaService for ALL queries
- Dates: store AD, return { ad, bs }
- Soft deletes only
- Standard response format
- Every controller method needs @Roles() guard
- SMS must always log to sms_logs before attempting send
- Never throw from event listeners — catch all errors silently
  (a failed SMS should not crash the attendance marking request)
```

---

## Learning checkpoint for Session 8

After this session, you should be able to answer:
- Why must event listeners never throw exceptions?
- What is the difference between an SMS log with status PENDING vs MOCK vs FAILED?
- Why do we deduplicate phone numbers in bulk SMS?
- What does "audience-based filtering" mean for notices?
- Why is SPARROW_SMS_ENABLED=false the safe default for development?
