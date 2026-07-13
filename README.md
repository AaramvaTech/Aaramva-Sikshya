<div align="center">

# आरामवा शिक्षा · Aaramva Shikshya

**Simple school management for every school in Nepal.**

A multi-tenant SaaS school management system (SMS / ERP) built for Nepali schools and colleges — with first-class Bikram Sambat (BS) calendar support, local payment gateways, and IRD-compliant billing.

[![NestJS](https://img.shields.io/badge/API-NestJS-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Web-Next.js%2016-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React Native](https://img.shields.io/badge/Mobile-Expo-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![Prisma](https://img.shields.io/badge/ORM-Prisma%206-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/DB-PostgreSQL%2016-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

</div>

---

## Overview

Aaramva Shikshya is a complete platform for running a school: admissions, academics, attendance, fees, exams, HR & payroll, library, and communication — all under one roof. Each school is an isolated **tenant** with its own data, branding, and subscription plan.

It is designed specifically for the Nepali context:

- 🗓️ **Bikram Sambat calendar** everywhere dates are shown to users
- 💳 **Local payment gateways** — eSewa, Khalti, ConnectIPS
- 📱 **Sparrow SMS** for parent/staff notifications
- 🧾 **IRD-compliant billing** with the Nepali fiscal year (Shrawan–Ashadh)

---

## ✨ Features

| Module | Status | Highlights |
|---|:---:|---|
| **Foundation** | ✅ | Tenant resolution, JWT auth (access + refresh), RBAC, schema-per-tenant Prisma |
| **Students** | ✅ | Admissions, profiles, class assignment, soft-delete, auto student IDs |
| **Academic** | ✅ | Academic years, classes, sections, subjects, timetable |
| **Attendance** | ✅ | Bulk student attendance, staff attendance, reports, printable/exportable |
| **Finance** | ✅ | Fee categories & structures, invoices (discounts/waivers), payments, ledgers |
| **HR & Staff** | ✅ | Staff profiles, departments, leave management, payroll & salary slips |
| **Examination** | ✅ | Grading scales, exam types & schedules, marks entry, report cards, rank lists |
| **Communication** | ✅ | Notice board, SMS (Sparrow), in-app notifications, event-driven alerts |
| **Library** | ✅ | Books & copies, members, issue/return, fines, overdue tracking |
| **Dashboard** | ✅ | Overview, weekly attendance, activity feed, upcoming exams, quick actions |
| **Super Admin** | ✅ | Platform-level school onboarding, plans, impersonation, audit logs, analytics |
| **E-Learning** | ⬜ | Assignments, materials, online classes *(planned)* |
| **Inventory** | ⬜ | Assets & stock *(planned)* |
| **Reports** | ⬜ | Cross-module analytics & exports *(planned)* |

> The backend ships with **180+ passing unit tests** across these modules.

---

## 🏗️ Tech stack

| Layer | Technology |
|---|---|
| **Backend** | NestJS (TypeScript), Prisma 6, PostgreSQL 16 |
| **Cache / Queue** | Redis + BullMQ (background jobs, e.g. daily fine recalculation) |
| **Web** | Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui |
| **State / Data** | TanStack Query (server state), Zustand (global state) |
| **Forms** | React Hook Form + Zod |
| **Mobile** | React Native + Expo (Student, Parent, Teacher apps) |
| **Auth** | JWT (httpOnly refresh cookie) + role-based guards |
| **Calendar** | Custom `bs-calendar` package (BS ↔ AD conversion) |

---

## 🔐 Multi-tenancy

Aaramva Shikshya uses **schema-per-tenant** isolation in a single PostgreSQL database:

- A shared `public` schema holds `tenants`, `plans`, and `subscriptions`.
- Each school gets its own schema: `tenant_<slug>` (e.g. `tenant_motherland_school`).
- `TenantMiddleware` resolves the tenant from the subdomain (or `X-Tenant-Slug` header in dev) into `AsyncLocalStorage`.
- `TenantPrismaService` sets the `search_path` per request so every query is automatically scoped to the right tenant.

```
schoolname.aaramvashikshya.com  →  tenant slug "schoolname"  →  schema tenant_schoolname
```

---

## 📁 Monorepo structure

```
.
├── apps/
│   ├── api/          # NestJS backend (REST + WebSocket) + Prisma schema & migrations
│   ├── web/          # Next.js admin portal & dashboards
│   └── mobile/       # React Native (Expo) apps
├── packages/
│   ├── bs-calendar/  # Nepali BS/AD calendar utilities
│   └── database/     # Shared DB assets
├── docs/             # API contracts, architecture & decisions
├── docker-compose.yml
└── CLAUDE.md         # Project memory / conventions
```

---

## 🚀 Getting started

### Prerequisites

- **Node.js** 24+
- **PostgreSQL** 17 (16 also works)
- **Redis** 7 (optional — the app runs fine without it)

No Docker required.

### Two commands from a fresh clone

```powershell
git clone <your-repo-url> aaramva-shikshya
cd aaramva-shikshya

npm run setup       # build bs-calendar, install all apps, create apps/api/.env
# edit apps/api/.env → DATABASE_URL (your Postgres), then:
npm run setup:db    # migrate + seed plans + seed the demo school (prints logins)
```

Then start the API (`cd apps/api && npm run start:dev`, port 3001) and the web
portal (`cd apps/web && npm run dev`, port 3000), open **http://localhost:3000**,
enter school code **`demo`**, and log in with the seeded demo credentials.

👉 **Full walkthrough — demo logins, mobile setup, and troubleshooting — is in
[`GETTING-STARTED.md`](./GETTING-STARTED.md).**

> **Local dev tip:** there are no subdomains on `localhost`. Pass the tenant via the `?tenant=<slug>` query param (web) or the `X-Tenant-Slug` header (API/mobile).

---

## 🧰 Common scripts

### API (`apps/api`)

| Command | Description |
|---|---|
| `npm run start:dev` | Start the API in watch mode |
| `npm run build` | Compile the API |
| `npm test` | Run the unit test suite |
| `npm run seed` | Seed subscription plans |
| `npx prisma migrate dev` | Create & apply a migration |
| `npx prisma generate` | Regenerate the Prisma client |

### Web (`apps/web`)

| Command | Description |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | Lint the web app |

---

## 🇳🇵 Nepal-specific details

- **Dates:** All user-facing dates render in Bikram Sambat via the `<BsDate>` component / `bs-calendar` package. Dates are **stored as AD** in PostgreSQL and converted only at the display/input layer.
- **Fiscal year:** Starts mid-July (1 Shrawan); fee structures are fiscal-year based.
- **Payments:** eSewa, Khalti, ConnectIPS.
- **SMS:** Sparrow SMS with Nepali phone normalization.
- **Billing:** Invoices follow Nepal's IRD format.

---

## 🗺️ Roadmap

- [ ] E-Learning — assignments, materials, online classes
- [ ] Inventory — assets & stock management
- [ ] Reports — cross-module analytics & exports
- [ ] Payment gateway integrations (eSewa / Khalti / ConnectIPS) end-to-end
- [ ] Mobile apps (Student / Parent / Teacher) feature parity

---

## 🤝 Contributing

This is an actively developed product. Start with **[`CONTRIBUTING.md`](./CONTRIBUTING.md)**
(branch naming, PR flow, secrets policy, the spec-first workflow) and
**[`CLAUDE.md`](./CLAUDE.md)** (conventions). In short:

1. Read [`CLAUDE.md`](./CLAUDE.md) for conventions (naming, response format, multi-tenancy rules).
2. Follow the established module structure under `apps/api/src/modules/`.
3. Keep all tenant-scoped DB access going through `TenantPrismaService`.
4. Add unit tests for new services, and keep the suite green before opening a PR.

---

## 📄 License

This project is currently private and proprietary. Update this section with your chosen license before publishing.

---

<div align="center">
<sub>Built with ❤️ for schools across Nepal.</sub>
</div>
