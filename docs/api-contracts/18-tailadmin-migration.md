# Session 18 — TailAdmin UI Migration
# Aaramva Shikshya

## Goal
Replace the current custom UI with TailAdmin's free Next.js template
while keeping ALL existing logic untouched:
- lib/api/* — all API functions stay
- lib/hooks/* — all TanStack Query hooks stay
- lib/schemas/* — all Zod schemas stay
- store/* — Zustand auth/tenant stores stay
- types/api.types.ts — all types stay
- middleware.ts — stays
- packages/bs-calendar — stays

Only the VISUAL layer changes: layouts, components, pages, styles.

---

## Strategy — Merge, don't replace

Do NOT delete apps/web and start fresh.
Instead, bring TailAdmin's components INTO the existing project.

This approach:
- Keeps your git history
- Keeps working API connections
- Lets you migrate page by page

---

## Step 1 — Clone TailAdmin alongside your project

```bash
# In your terminal, OUTSIDE the Aaramva-Shikshya folder
git clone https://github.com/TailAdmin/free-nextjs-admin-dashboard tailadmin-source

# Look at its structure:
# tailadmin-source/
# ├── src/
# │   ├── app/
# │   │   ├── layout.tsx
# │   │   └── (pages)/
# │   │       └── dashboard/
# ├── public/
# └── package.json
```

---

## Step 2 — Copy TailAdmin components into your project

From `tailadmin-source/src/`, copy these into `apps/web/src/` (create src/ if needed):

```bash
# Copy TailAdmin's component library
cp -r tailadmin-source/src/components apps/web/src/components-tailadmin

# Copy TailAdmin's layout components specifically
# These are the sidebar, header, and shell
```

Key TailAdmin components to extract:
- `components/Layouts/` — the main shell (sidebar + header wrapper)
- `components/Sidebar/` — the sidebar with collapsible nav
- `components/Header/` — top bar with notifications, user menu
- `components/ui/` — buttons, cards, badges, tables, modals
- `components/Charts/` — recharts wrappers with TailAdmin styling

---

## Step 3 — Update Tailwind config to match TailAdmin

TailAdmin uses specific color tokens. Replace `apps/web/tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        current: "currentColor",
        transparent: "transparent",
        white: "#FFFFFF",
        black: "#1C2434",
        "black-2": "#010101",
        body: "#64748B",
        bodydark: "#AEB7C0",
        bodydark1: "#DEE4EE",
        bodydark2: "#8A99AF",
        primary: "#3C50E0",       // TailAdmin blue — change to your green if wanted
        secondary: "#80CAEE",
        stroke: "#E2E8F0",
        gray: {
          1: "#F9FAFB", 2: "#F3F4F6", 3: "#E5E7EB",
          4: "#D1D5DB", 5: "#9CA3AF", 6: "#6B7280",
          7: "#374151",
        },
        graydark: "#333A48",
        "gray-2": "#F7F9FC",
        "gray-3": "#FAFAFA",
        whiten: "#F1F5F9",
        whiter: "#F5F7FD",
        boxdark: "#24303F",
        "boxdark-2": "#1A222C",
        strokedark: "#2E3A47",
        "form-strokedark": "#3d4d60",
        "form-input": "#1d2a39",
        "meta-1": "#DC3545",
        "meta-2": "#EFF2F7",
        "meta-3": "#10B981",
        "meta-4": "#313D4A",
        "meta-5": "#259AE6",
        "meta-6": "#FFBA00",
        "meta-7": "#FF6766",
        "meta-8": "#F0950C",
        "meta-9": "#E5E7EB",
        "meta-10": "#0EA5E9",
        success: "#219653",
        danger: "#D34053",
        warning: "#FFA70B",
      },
      fontSize: {
        "title-xxl": ["44px", "55px"],
        "title-xl": ["36px", "45px"],
        "title-xl2": ["33px", "45px"],
        "title-lg": ["28px", "35px"],
        "title-md": ["24px", "30px"],
        "title-md2": ["26px", "30px"],
        "title-sm": ["20px", "26px"],
        "title-xsm": ["18px", "24px"],
      },
      boxShadow: {
        default: "0px 8px 13px -3px rgba(0, 0, 0, 0.07)",
        card: "0px 1px 3px rgba(0, 0, 0, 0.12)",
        "card-2": "0px 1px 2px rgba(0, 0, 0, 0.05)",
        switcher: "0px 2px 4px rgba(0, 0, 0, 0.2), inset 0px 2px 4px rgba(0, 0, 0, 0.1)",
        "switch-1": "0px 0px 5px rgba(0, 0, 0, 0.15)",
        1: "0px 1px 3px rgba(0, 0, 0, 0.08)",
        2: "0px 1px 4px rgba(0, 0, 0, 0.12)",
        3: "0px 1px 5px rgba(0, 0, 0, 0.14)",
        4: "0px 4px 10px rgba(0, 0, 0, 0.12)",
        5: "0px 1px 1px rgba(0, 0, 0, 0.15)",
        6: "0px 3px 15px rgba(0, 0, 0, 0.1)",
        7: "-5px 0 0 #313D4A, 5px 0 0 #313D4A",
        8: "1px 0 0 #313D4A, -1px 0 0 #313D4A, 0 1px 0 #313D4A, 0 -1px 0 #313D4A, 0 3px 13px rgb(0,0,0,0.08)",
      },
    },
  },
  plugins: [],
};
export default config;
```

---

## Step 4 — Replace globals.css

Replace `apps/web/src/app/globals.css` (or `app/globals.css`) with TailAdmin's globals.
Copy from `tailadmin-source/src/app/globals.css`.

This includes:
- Custom scrollbar styles
- Form element resets
- Flatpickr date picker styles
- Dark mode CSS variables

---

## Step 5 — Rebuild the School Shell Layout

This is the most important step. Replace your current shell with TailAdmin's.

File: `apps/web/src/app/(school)/layout.tsx`

TailAdmin's layout structure:
```tsx
"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Your existing auth guard logic here
  // (check Zustand auth store, redirect to /login if no token)

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div className="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        <main>
          <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
```

---

## Step 6 — Rebuild the Sidebar with Aaramva Shikshya nav items

Take TailAdmin's Sidebar component and replace its nav items with yours.

TailAdmin sidebar structure:
- Logo at top
- Nav groups with icons
- Collapsible sub-menus
- Active state highlighted in blue (change to green for Aaramva)
- Mobile: slides in as overlay

Your nav items (keep these exact paths):
```typescript
const navGroups = [
  {
    label: "MAIN MENU",
    items: [
      { icon: <GridIcon />, label: "Dashboard", href: "/dashboard" },
      { icon: <UsersIcon />, label: "Students", href: "/students",
        subItems: [
          { label: "All Students", href: "/students" },
          { label: "Admit Student", href: "/students/new" },
        ]
      },
      { icon: <CheckSquareIcon />, label: "Attendance", href: "/attendance",
        subItems: [
          { label: "Mark Attendance", href: "/attendance/mark" },
          { label: "Reports", href: "/attendance/reports" },
        ]
      },
      { icon: <BookOpenIcon />, label: "Academic", href: "/academic",
        subItems: [
          { label: "Classes", href: "/academic/classes" },
          { label: "Subjects", href: "/academic/subjects" },
          { label: "Timetable", href: "/academic/timetable" },
        ]
      },
      { icon: <CreditCardIcon />, label: "Finance", href: "/finance",
        subItems: [
          { label: "Overview", href: "/finance" },
          { label: "Invoices", href: "/finance/invoices" },
          { label: "Fee Structures", href: "/finance/fee-structures" },
          { label: "Reports", href: "/finance/reports" },
        ]
      },
      { icon: <FileTextIcon />, label: "Examinations", href: "/exams",
        subItems: [
          { label: "Exam Types", href: "/exams" },
          { label: "Schedule", href: "/exams/schedule" },
          { label: "Enter Marks", href: "/exams/marks" },
          { label: "Results", href: "/exams/results" },
        ]
      },
      { icon: <UserCogIcon />, label: "HR & Staff", href: "/hr",
        subItems: [
          { label: "Staff", href: "/hr/staff" },
          { label: "Leave", href: "/hr/leave" },
          { label: "Payroll", href: "/hr/payroll" },
        ]
      },
      { icon: <LibraryIcon />, label: "Library", href: "/library",
        subItems: [
          { label: "Books", href: "/library/books" },
          { label: "Issues", href: "/library/issues" },
        ]
      },
      { icon: <MessageSquareIcon />, label: "Communication", href: "/communication",
        subItems: [
          { label: "Notices", href: "/communication/notices" },
          { label: "SMS Center", href: "/communication/sms" },
        ]
      },
    ]
  }
];
```

---

## Step 7 — Replace the Header

Take TailAdmin's Header component and wire in your existing:
- Notification bell (from Session 16 — `useUnreadCount` hook)
- User avatar + dropdown (logout, profile)
- School name from `useTenantStore`
- Mobile sidebar toggle

TailAdmin header includes by default:
- Search bar (can hide or keep)
- Dark mode toggle (keep — it's a nice feature)
- Notification bell with dropdown
- User menu with avatar

Wire your `communicationApi.getMyNotifications()` into the notification dropdown.

---

## Step 8 — Replace shared components with TailAdmin equivalents

| Old component | TailAdmin replacement |
|---------------|----------------------|
| `<PageHeader>` | TailAdmin's page title pattern (h1 + breadcrumb) |
| `<DataTable>` | TailAdmin's table styles + your TanStack Table logic |
| `<StatusBadge>` | TailAdmin's badge component |
| `<ConfirmDialog>` | TailAdmin's modal component |
| `<EmptyState>` | Custom — TailAdmin doesn't have one, keep yours |
| `<AmountDisplay>` | Keep as-is |
| `<BsDate>` | Keep as-is |
| `<BsDateInput>` | Style with TailAdmin form styles |

For DataTable — keep your TanStack Table logic but wrap it in TailAdmin's table HTML:
```tsx
// TailAdmin table structure
<div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
  <div className="px-4 py-6 md:px-6 xl:px-7.5">
    <h4 className="text-xl font-semibold text-black dark:text-white">
      {title}
    </h4>
  </div>
  <div className="grid grid-cols-[...] border-t border-stroke px-4 py-4.5 dark:border-strokedark">
    {/* headers */}
  </div>
  {rows.map(row => (
    <div className="grid grid-cols-[...] border-t border-stroke px-4 py-4.5 dark:border-strokedark sm:grid-cols-[...]">
      {/* cells */}
    </div>
  ))}
</div>
```

---

## Step 9 — Rebuild the Dashboard page

Replace your current dashboard with TailAdmin's eCommerce dashboard style.

TailAdmin dashboard card pattern:
```tsx
// Stat card
<div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
  <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-meta-2 dark:bg-meta-4">
    <UsersIcon className="fill-primary dark:fill-white" />
  </div>
  <div className="mt-4 flex items-end justify-between">
    <div>
      <h4 className="text-title-md font-bold text-black dark:text-white">
        {value}
      </h4>
      <span className="text-sm font-medium">{label}</span>
    </div>
    <span className="flex items-center gap-1 text-sm font-medium text-meta-3">
      {trend}% <ArrowUpIcon />
    </span>
  </div>
</div>
```

Four stat cards for Aaramva Shikshya dashboard:
- Total Students (with trend vs last month)
- Today's Attendance %
- Fee Collection this month (Rs.)
- Pending Invoices count

Below cards: a Recharts bar chart for weekly attendance.

---

## Step 10 — Login page TailAdmin style

TailAdmin login page pattern:
```
Split screen:
Left half  — decorative (school illustration or gradient with logo)
Right half — login form

Right side:
  Logo
  "Sign in to Aaramva Shikshya"
  School Code field
  Email field
  Password field
  [Sign In] button (full width, primary blue/green)
  "Forgot password?" link (placeholder)
```

Use TailAdmin's form input styles:
```tsx
<div className="mb-4">
  <label className="mb-2.5 block font-medium text-black dark:text-white">
    Email
  </label>
  <div className="relative">
    <input
      type="email"
      placeholder="Enter your email"
      className="w-full rounded-lg border border-stroke bg-transparent py-4 pl-6 pr-10 text-black outline-none focus:border-primary focus-visible:shadow-none dark:border-form-strokedark dark:bg-form-input dark:text-white dark:focus:border-primary"
    />
    <span className="absolute right-4 top-4">
      <EmailIcon />
    </span>
  </div>
</div>
```

---

## Exact prompt for Claude Code

```
Read CLAUDE.md in full.
Read docs/api-contracts/18-tailadmin-migration.md in full.

The goal: migrate apps/web/ to use TailAdmin's visual design
while keeping ALL existing logic (hooks, API, stores, types) intact.

FIRST — clone TailAdmin separately (outside the project):
git clone https://github.com/TailAdmin/free-nextjs-admin-dashboard C:/tailadmin-source
(adjust path for your OS)

Then work in this order inside apps/web/:

1. Install TailAdmin dependencies if any are missing:
   Check tailadmin-source/package.json for packages not in apps/web/package.json
   Install missing ones. Key ones: apexcharts, react-apexcharts, jsvectormap
   (only install if we actually use charts/maps)

2. Copy TailAdmin's Tailwind config colors/shadows/fonts
   into apps/web/tailwind.config.ts (merge, don't replace breakpoints etc.)

3. Copy TailAdmin's globals.css into apps/web/src/app/globals.css
   (or app/globals.css — wherever your current globals.css is)

4. Copy these TailAdmin component folders into apps/web/components/:
   - Sidebar/ (the full sidebar component)
   - Header/ (the header with dark mode, notifications, user menu)
   - Charts/ (recharts-based chart wrappers)
   - common/ (icons, breadcrumbs etc.)

5. Rebuild app/(school)/layout.tsx using TailAdmin's shell pattern:
   - sidebarOpen state
   - <Sidebar> + <Header> + <main> structure
   - Keep existing auth guard logic (Zustand check → redirect /login)

6. Update Sidebar component nav items to match Aaramva Shikshya modules:
   Students, Attendance, Academic, Finance, Examinations,
   HR & Staff, Library, Communication
   With sub-items and correct hrefs.
   Wire active state to current pathname (usePathname()).

7. Wire Header component:
   - School name from useTenantStore
   - Notification bell using useUnreadCount() and useMyNotifications()
   - User avatar/name from useAuthStore
   - Dark mode toggle (keep TailAdmin's existing implementation)
   - Logout calls authApi.logout() + authStore.logout() + router.push('/login')

8. Rebuild the Dashboard page (app/(school)/dashboard/page.tsx)
   using TailAdmin stat card pattern + real data from:
   - useStudents({ limit: 1 }) for student count (use meta.total)
   - useSchoolAttendanceSummary() for today's attendance
   - useCollectionReport() for fee data
   Add a weekly attendance bar chart using recharts (TailAdmin style)

9. Rebuild the Login page (app/(auth)/login/page.tsx)
   using TailAdmin's split-screen login design.
   Keep existing React Hook Form + Zod + authApi.login() logic.
   Add school code field that sets X-Tenant-Slug header.

10. Replace shared components with TailAdmin-styled versions:
    - DataTable: keep TanStack Table logic, wrap in TailAdmin table HTML/classes
    - StatusBadge: use TailAdmin badge classes
    - PageHeader: use TailAdmin page title pattern
    - ConfirmDialog: use TailAdmin modal component

DO NOT touch:
- lib/api/* — any file
- lib/hooks/* — any file
- lib/schemas/* — any file
- store/* — any file
- types/api.types.ts
- middleware.ts

After each step, run: npm run build
Fix TypeScript errors before moving to next step.
```

---

## After Session 18

Once the shell, layout, sidebar, header, dashboard and login
are done with TailAdmin styling, Session 19 will migrate
individual module pages one by one:
- Students pages (list, admission form, profile)
- Attendance marking grid
- Finance pages
- etc.

The module page migration is faster because the pattern is
established — just apply TailAdmin card/table/form styles
to pages that already have working logic.

---

## Learning checkpoint for Session 18

After this session you should be able to answer:
- What is the difference between copying a template and building from scratch?
- Why do we keep lib/hooks/* and lib/api/* untouched during a UI migration?
- What does "dark mode class" strategy mean in Tailwind?
- Why does TailAdmin use custom color names like meta-3 and strokedark?
```
