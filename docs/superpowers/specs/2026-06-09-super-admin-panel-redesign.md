# SuperAdmin Panel — Complete Redesign Spec

> 2026-06-09 — Full overhaul of the SuperAdmin panel: fix broken interactions, add missing features, match TailAdmin Pro styling.

---

## 1. Problem Statement

The current SuperAdmin panel has two categories of issues:

### Broken UI Interactions
- **Select components**: Custom `@base-ui/react` Select doesn't correctly display selected values when data is async-loaded. The school portal has the correct pattern (computed `<span>` inside `<SelectTrigger>`), but superadmin pages use the broken pattern.
- **No SidebarProvider context**: The superadmin layout is standalone and re-implements sidebar/header inline, missing the shared context that enables collapsible sidebar, mobile backdrop, etc.
- **API response parsing**: Some hooks may not correctly extract data from the nested response format (`ApiResponse<T>` → Axios `.data` → `ResponseInterceptor`).
- **Form validation**: Onboard School and Plan forms use manual `if` checks instead of proper Zod + React Hook Form validation.
- **Impersonation flow**: Token handling after impersonation may not correctly reset auth state.

### Missing Features (backend has no frontend)
- **Revenue Analytics page**: Backend endpoint `GET /api/v1/super-admin/analytics/revenue` exists but no frontend page.
- **Platform Settings page**: No page for platform-wide configuration (SMTP, SMS provider, payment gateways, branding).
- **School edit/update**: Backend has `PATCH /super-admin/tenants/:id` but frontend doesn't use it.
- **Theme toggle** in superadmin header.
- **Notification bell** in superadmin header.
- **User menu dropdown** in superadmin header.
- **Search bar with Cmd+K** in superadmin header.
- **Collapsible sidebar**: SuperAdmin sidebar is fixed-width with no collapse/expand.

---

## 2. Architecture

### 2.1 Layout System — New `SuperAdminShell`

Replace the inline layout in `superadmin/layout.tsx` with a proper shell component:

```
components/layout/super-admin-shell.tsx    — Layout wrapper (auth guard + shell)
components/layout/super-admin-sidebar.tsx  — Collapsible dark sidebar
components/layout/super-admin-header.tsx   — Full header with search/theme/notifs/user
```

The shell mirrors the school portal's `SchoolShell` pattern:
- **Sidebar**: Dark (`bg-gray-900`), collapsible (expanded: 260px, collapsed: 70px), hover-to-expand on desktop, mobile overlay with backdrop
- **Header**: White/dark bar with sidebar toggle, search bar, theme toggle, notification bell, user menu dropdown
- **Content area**: Responsive margin based on sidebar state

Uses the same `SidebarProvider` context from `context/sidebar-context.tsx`.

### 2.2 Navigation Structure

```
Dashboard      → /super-admin/dashboard     (LayoutDashboard icon)
Schools        → /super-admin/schools       (School icon)
  └─ Detail    → /super-admin/schools/[id]  (dynamic)
Plans          → /super-admin/plans         (CreditCard icon)
Revenue       → /super-admin/revenue       (TrendingUp icon)  [NEW]
Audit Log      → /super-admin/audit         (ClipboardList icon)
Settings       → /super-admin/settings      (Settings icon)     [NEW]
```

Navigation groups: **Overview** (Dashboard, Revenue), **Management** (Schools, Plans), **System** (Audit, Settings).

---

## 3. Pages

### 3.1 Dashboard (`/super-admin/dashboard`)

**Existing page** — keep current layout, fix data extraction.

Changes:
- Add revenue chart (calls `GET /super-admin/analytics/revenue`) — bar chart showing monthly revenue
- Fix `usePlatformOverview` hook to correctly extract data
- Add "Revenue" quick stat card linking to `/super-admin/revenue`
- Link school names in "Recently Joined" table to `/super-admin/schools/[id]`

### 3.2 Revenue Analytics (`/super-admin/revenue`) — NEW

Full page with:
- Monthly revenue bar chart (12 months) using CSS bars (no chart library)
- Plan-wise revenue breakdown (pie-like summary cards)
- Total revenue this month / last month comparison card
- Data from `GET /super-admin/analytics/revenue`

Hook: `useRevenueAnalytics()` using `superAdminApi.getRevenue()`.

### 3.3 Schools List (`/super-admin/schools`)

**Existing page** — fix Select components, fix data extraction.

Changes:
- Fix `Select` components for plan filter and status filter (computed `<span>` pattern)
- Fix onboard dialog form: switch from manual validation to Zod + React Hook Form
- Fix pagination meta extraction from API response
- Fix impersonation flow: ensure correct token shape after `data.data`
- Add "Edit" action to school rows (opens edit dialog)
- Add bulk export button (CSV export of current filtered list)

### 3.4 School Detail (`/super-admin/schools/[id]`)

**Existing page** — fix plan change Select, add missing features.

Changes:
- Fix plan change `Select` to use computed `<span>` pattern
- Add "Edit School" button that opens a dialog with pre-filled form (calls `PATCH /tenants/:id`)
- Add activity/audit trail section showing audit logs filtered to this tenant
- Fix impersonation token handling

### 3.5 Plans (`/super-admin/plans`)

**Existing page** — fix data flow in create/edit dialogs.

Changes:
- Fix `PlanFormDialog`: ensure form state resets properly between open/close
- Add loading states to Edit and Deactivate buttons
- Add confirmation toast with plan name for clarity
- Add annual/monthly price toggle display on plan cards

### 3.6 Audit Log (`/super-admin/audit`)

**Existing page** — minor fixes.

Changes:
- Fix pagination to use the shared `DataTable` pagination or fix custom pagination
- Add filter by action type (dropdown filter)
- Add filter by date range
- Add admin email filter

### 3.7 Platform Settings (`/super-admin/settings`) — NEW

New page with sections:
- **General**: Platform name, default trial days, default plan
- **SMTP**: Host, port, username, password (test email button)
- **SMS Provider**: Sparrow SMS token, sender ID, enabled toggle
- **Payment Gateways**: eSewa enabled + secret key, Khalti enabled + secret key
- **Branding**: Platform logo upload, primary color picker

Backend note: If settings endpoints don't exist yet, create a simple key-value `platform_settings` table in the public schema with CRUD endpoints.

---

## 4. Bug Fixes (Detail)

### 4.1 Select Component Pattern

**All pages**: Replace the broken pattern where `SelectValue` is used directly with async data:

```tsx
// BROKEN — SelectValue shows empty when data hasn't loaded yet
<SelectTrigger>
  <SelectValue placeholder="Select plan" />
</SelectTrigger>

// FIXED — computed span looks up name from loaded data
<SelectTrigger>
  <span className="truncate">
    {plans?.find((p) => p.id === selectedId)?.name ?? 'Select plan'}
  </span>
</SelectTrigger>
```

Apply to: Schools page (plan filter, onboard form plan select), School detail (plans page).

### 4.2 API Response Parsing

Verify all hooks extract data correctly. The pattern should be:

```tsx
// ResponseInterceptor wraps: { success: true, data: T }
// Axios response: { data: { success: true, data: T } }
// So: r.data.data gives us T

queryFn: () => superAdminApi.getOverview().then((r) => r.data.data)
```

For arrays, the backend returns `ApiResponse<T[]>`, so `r.data.data` is `T[]`.
For paginated, `ApiResponse<PaginatedResponse<T>>`, so `r.data.data` is `{ data: T[], meta: {...} }`.

### 4.3 Form Validation

Onboard School form: Use `onboardTenantSchema` with `zodResolver` + `react-hook-form`.
Plan forms: Use `createPlanSchema` with `zodResolver` + `react-hook-form`.

### 4.4 Sidebar Provider

Wrap the superadmin layout content in `SidebarProvider` so the collapsible sidebar and mobile overlay work correctly.

---

## 5. File Changes

### New Files
```
components/layout/super-admin-shell.tsx
components/layout/super-admin-sidebar.tsx
components/layout/super-admin-header.tsx
app/super-admin/revenue/page.tsx
app/super-admin/settings/page.tsx
lib/hooks/use-revenue.ts
lib/hooks/use-platform-settings.ts
lib/api/settings.api.ts
lib/schemas/settings.schema.ts
```

### Modified Files
```
app/super-admin/layout.tsx          — replace inline layout with SuperAdminShell
app/super-admin/dashboard/page.tsx   — add revenue chart, fix data
app/super-admin/schools/page.tsx     — fix Select, fix forms, add edit
app/super-admin/schools/[id]/page.tsx — fix Select, add edit, add audit trail
app/super-admin/plans/page.tsx       — fix dialog state, add loading states
app/super-admin/audit/page.tsx       — add filters
lib/api/super-admin.api.ts           — add getRevenue endpoint call
```

---

## 6. Success Criteria

1. All form dialogs (onboard school, create/edit plan, edit school) open, validate, and submit correctly
2. All Select dropdowns display the correct selected value after data loads
3. Pagination works on Schools and Audit pages
4. Suspend/Activate/Impersonate actions work without page reload (React Query cache invalidation)
5. Revenue analytics page renders with data from backend
6. Platform Settings page saves and loads configuration
7. Sidebar collapses/expands on desktop, mobile overlay works
8. Theme toggle works across all superadmin pages
9. User menu dropdown shows admin email and role
10. Search bar is visible in header (even if just UI — functional command palette is stretch goal)
