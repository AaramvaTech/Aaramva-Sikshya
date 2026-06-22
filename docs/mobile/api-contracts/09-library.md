# Library Module — Claude Code Session 9 Spec
# Aaramva Shikshya

## Prerequisites
- Sessions 0–8 complete, 130 tests passing
- users table exists (borrowers can be students or staff)
- students table exists
- EventEmitterModule registered

## Goal
Build the Library module:
- Book catalogue (books, authors, publishers, categories)
- Book copies (one book title can have multiple physical copies)
- Issue & return tracking
- Fine calculation for overdue returns
- Library member management (students and staff)

This is a lighter module — focus on clean data modelling and
getting the issue/return flow exactly right.

---

## Key concept — Book vs Book Copy

A **Book** is the title: "Wings of Fire" by APJ Abdul Kalam, ISBN 9780863111778.
A **BookCopy** is a physical copy: Copy #1 of that book, on Shelf B-3, currently issued.

One book can have many copies. You issue a *copy*, not a book.
This lets you track exactly which physical copy is with which student.

---

## Database — add to tenant-schema.sql

```sql
-- ─── LIBRARY MEMBERS ──────────────────────────────────────────────────────────
-- Any user (student or staff) who can borrow books
CREATE TABLE IF NOT EXISTS library_members (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES users(id),        -- NULL for student members
  student_id    UUID        REFERENCES students(id),     -- NULL for staff members
  member_number VARCHAR(20) NOT NULL UNIQUE,             -- "LIB-2081-0001"
  max_books     SMALLINT    NOT NULL DEFAULT 2,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  joined_at     DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  -- Either user_id or student_id must be set, not both
  CONSTRAINT chk_member_type CHECK (
    (user_id IS NOT NULL AND student_id IS NULL) OR
    (user_id IS NULL AND student_id IS NOT NULL)
  )
);

-- ─── BOOK CATEGORIES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS book_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,    -- "Science", "Literature", "Reference"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- ─── BOOKS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS books (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         VARCHAR(300) NOT NULL,
  author        VARCHAR(200),
  publisher     VARCHAR(200),
  isbn          VARCHAR(20),
  category_id   UUID        REFERENCES book_categories(id),
  edition       VARCHAR(50),
  language      VARCHAR(30) NOT NULL DEFAULT 'Nepali',
  description   TEXT,
  cover_url     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_books_title  ON books USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_books_isbn   ON books(isbn) WHERE isbn IS NOT NULL;

-- ─── BOOK COPIES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS book_copies (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id       UUID        NOT NULL REFERENCES books(id),
  copy_number   VARCHAR(20) NOT NULL,   -- "001", "002" — unique per book
  accession_number VARCHAR(30) UNIQUE,  -- school's own cataloguing number
  shelf_location VARCHAR(50),           -- "A-3", "Reference-1"
  condition     VARCHAR(20) NOT NULL DEFAULT 'GOOD',
                            -- GOOD | FAIR | DAMAGED | LOST | WITHDRAWN
  is_available  BOOLEAN     NOT NULL DEFAULT true,  -- false when issued
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE (book_id, copy_number)
);

CREATE INDEX IF NOT EXISTS idx_copies_available ON book_copies(book_id, is_available)
  WHERE deleted_at IS NULL;

-- ─── ISSUES (lending records) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS book_issues (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  book_copy_id    UUID        NOT NULL REFERENCES book_copies(id),
  member_id       UUID        NOT NULL REFERENCES library_members(id),
  issued_by       UUID        NOT NULL REFERENCES users(id),
  issued_at       DATE        NOT NULL DEFAULT CURRENT_DATE,   -- AD
  due_date        DATE        NOT NULL,                        -- AD
  returned_at     DATE,                                        -- AD, NULL if not returned
  returned_to     UUID        REFERENCES users(id),
  fine_per_day    NUMERIC(6,2) NOT NULL DEFAULT 5,             -- Rs. 5/day default
  fine_days       INT         NOT NULL DEFAULT 0,
  fine_amount     NUMERIC(8,2) NOT NULL DEFAULT 0,
  fine_paid       BOOLEAN     NOT NULL DEFAULT false,
  status          VARCHAR(20) NOT NULL DEFAULT 'ISSUED',
                  -- ISSUED | RETURNED | OVERDUE | LOST
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issues_member   ON book_issues(member_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_copy     ON book_issues(book_copy_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_due      ON book_issues(due_date, status)
  WHERE status = 'ISSUED';
```

---

## API Endpoints

### Book Categories
| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /library/categories | LIBRARIAN+ | Create |
| GET | /library/categories | All authenticated | List |
| DELETE | /library/categories/:id | PRINCIPAL+ | Soft delete |

### Books
| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /library/books | LIBRARIAN+ | Add book to catalogue |
| GET | /library/books | All authenticated | List + search (title, author, isbn) |
| GET | /library/books/:id | All authenticated | Detail with copy availability |
| PATCH | /library/books/:id | LIBRARIAN+ | Update |
| DELETE | /library/books/:id | PRINCIPAL+ | Soft delete |
| POST | /library/books/:id/copies | LIBRARIAN+ | Add physical copy |
| GET | /library/books/:id/copies | LIBRARIAN+ | List copies for a book |
| PATCH | /library/books/:id/copies/:copyId | LIBRARIAN+ | Update copy condition/location |

### Library Members
| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /library/members | LIBRARIAN+ | Register member (student or staff) |
| GET | /library/members | LIBRARIAN+ | List all members |
| GET | /library/members/:id | LIBRARIAN+ | Member detail + current issues |
| PATCH | /library/members/:id | LIBRARIAN+ | Update (max_books, is_active) |

### Issue & Return
| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /library/issues | LIBRARIAN+ | Issue a book copy to a member |
| GET | /library/issues | LIBRARIAN+ | List all issues (filter by status, member) |
| GET | /library/issues/overdue | LIBRARIAN+ | Overdue issues only |
| PATCH | /library/issues/:id/return | LIBRARIAN+ | Process book return |
| PATCH | /library/issues/:id/mark-lost | LIBRARIAN+ | Mark copy as lost |
| PATCH | /library/issues/:id/pay-fine | LIBRARIAN+ | Record fine payment |

---

## Key DTOs

```typescript
// AddBookDto
{
  title: string;
  author?: string;
  publisher?: string;
  isbn?: string;
  categoryId?: string;
  edition?: string;
  language?: string;
  description?: string;
}

// AddCopyDto
{
  copyNumber: string;           // "001", "002"
  accessionNumber?: string;
  shelfLocation?: string;
  condition?: 'GOOD' | 'FAIR' | 'DAMAGED';
}

// RegisterMemberDto
{
  type: 'STUDENT' | 'STAFF';
  studentId?: string;           // required if type = STUDENT
  userId?: string;              // required if type = STAFF
  maxBooks?: number;            // default 2
}

// IssueBookDto
{
  bookCopyId: string;
  memberId: string;
  dueDate: string;              // AD date — librarian sets the return deadline
  finePerDay?: number;          // default 5 (Rs.)
  notes?: string;
}

// ReturnBookDto
{
  notes?: string;
}
```

---

## Business logic rules

### 1. Member number format
`LIB-{BS_YEAR}-{4-digit}` using the sequences table. e.g. `LIB-2081-0023`

### 2. Issue validation — check before issuing
```
Before issuing:
  a. Is the copy available? (is_available = true, deleted_at IS NULL)
     → if not: throw BadRequestException('Book copy is not available')
  b. Is the member active?
     → if not: throw BadRequestException('Library member is inactive')
  c. Has the member reached their max_books limit?
     Count ISSUED (not returned) records for this member
     → if count >= member.max_books: throw BadRequestException('Member has reached borrowing limit')
  d. Does the member have unpaid fines?
     → if yes: throw BadRequestException('Member has unpaid fines — please clear dues first')
```

### 3. Issue a book — atomic operation
```
In a single transaction:
  1. INSERT into book_issues (status = 'ISSUED')
  2. UPDATE book_copies SET is_available = false WHERE id = bookCopyId
```

### 4. Return a book — atomic operation
```
In a single transaction:
  1. Calculate fine:
     today = current AD date
     if today > due_date:
       fine_days = today - due_date (in calendar days)
       fine_amount = fine_days * fine_per_day
     else:
       fine_days = 0, fine_amount = 0
  2. UPDATE book_issues SET
       status = 'RETURNED',
       returned_at = today,
       returned_to = currentUserId,
       fine_days = calculated,
       fine_amount = calculated
  3. UPDATE book_copies SET is_available = true
  4. If fine_amount > 0: status remains 'RETURNED', fine_paid = false
     (librarian will call pay-fine separately)
```

### 5. Mark as lost
```
In a transaction:
  1. UPDATE book_issues SET status = 'LOST'
  2. UPDATE book_copies SET condition = 'LOST', is_available = false
  3. Set fine_amount to replacement cost (use full_marks... or just set notes)
     For now: leave fine_amount = 0, librarian handles manually
```

### 6. Pay fine
```
UPDATE book_issues SET fine_paid = true WHERE id = issueId
```
Simple — no payment gateway integration needed (cash at library counter).

### 7. Book search — full text search
```sql
-- GET /library/books?search=wings+of+fire
SELECT * FROM books
WHERE deleted_at IS NULL
  AND (
    to_tsvector('english', title) @@ plainto_tsquery('english', $search)
    OR author ILIKE '%' || $search || '%'
    OR isbn = $search
  )
ORDER BY title ASC
LIMIT $limit OFFSET $offset;
```

### 8. GET /library/books/:id response
```typescript
{
  id, title, author, publisher, isbn, edition, language,
  category: { id, name },
  totalCopies: number,
  availableCopies: number,
  copies: {
    id, copyNumber, accessionNumber, shelfLocation, condition, isAvailable,
    currentIssue?: { memberId, memberNumber, dueDate: { ad, bs }, isOverdue }
  }[]
}
```

### 9. Overdue detection
An issue is overdue when: `status = 'ISSUED' AND due_date < CURRENT_DATE`
The `GET /library/issues/overdue` endpoint returns these with calculated overdue days.
No background job needed — calculated on query.

---

## Tests to write

```typescript
// BookService
- addBook creates book record
- searchBooks returns results matching title (case-insensitive)
- addCopy creates copy with is_available=true
- addCopy throws if copy_number already exists for same book

// IssueService
- issueBook throws if copy is not available
- issueBook throws if member is inactive
- issueBook throws if member at max_books limit
- issueBook throws if member has unpaid fines
- issueBook sets is_available=false on copy (atomic)
- returnBook calculates fine correctly (5 Rs/day × overdue days)
- returnBook sets is_available=true on copy (atomic)
- returnBook sets fine_days=0 when returned before due date
- getOverdueIssues returns only ISSUED records past due_date

// MemberService
- registerMember generates LIB-YEAR-NNNN member number
- registerMember throws if student already has a member record
```

---

## Exact prompt for Claude Code

```
Read CLAUDE.md in full. Confirm you have read it.
Then read docs/api-contracts/09-library.md in full.

Sessions 0–8 complete. 130 tests passing.
The sequences table exists in tenant-schema.sql.

Session 9 task: Build the Library module.

Work in this order:

1. Add 5 tables to tenant-schema.sql with IF NOT EXISTS:
   library_members, book_categories, books, book_copies, book_issues

2. Build BookCategoryService — simple CRUD.

3. Build BookService:
   - addBook(), updateBook(), softDeleteBook()
   - addCopy() — throws on duplicate copy_number for same book
   - getBookDetail() — nested with copies + current issue info
   - searchBooks() — full text search using PostgreSQL to_tsvector

4. Build LibraryMemberService:
   - registerMember() — validate student/staff type, generate LIB-YEAR-NNNN
   - getMemberDetail() — profile + currently issued books
   - Cannot register same student/user twice (check before insert)

5. Build IssueService:
   - issueBook() — 4 pre-checks from spec, then atomic issue transaction
   - returnBook() — calculate fine, atomic return transaction
   - markLost() — atomic lost transaction
   - payFine() — simple update
   - getIssues() — paginated, filterable by status/member
   - getOverdueIssues() — ISSUED records where due_date < today

6. Wire LibraryController with all endpoints + correct @Roles() guards.

7. Write all tests. Run full suite.
   Target: 130 existing + ~13 new = 143+ passing.

Rules (same as always):
- TenantPrismaService for ALL queries
- Dates: store AD, return { ad, bs } using adToBs
- Soft deletes only (except book_issues — no deleted_at needed there)
- Standard response format
- Every controller method needs @Roles() guard
- Issue and return MUST be atomic (both steps in one transaction)
```

---

## Learning checkpoint for Session 9

After this session, you should be able to answer:
- What is the difference between a Book and a BookCopy in this system?
- What is a CHECK constraint and what does the library_members one enforce?
- What is full-text search and how is it different from ILIKE?
- Why must issue and return operations be atomic?
