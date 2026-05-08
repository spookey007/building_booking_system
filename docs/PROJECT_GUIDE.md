# Apartment Booking System - Project Guide

## Purpose
This platform is built for a builder/developer to manage apartment and shop inventory, booking operations, customer records, installment plans, and role-based operations from one secure system.

## Stack
- Next.js (App Router, TypeScript)
- Tailwind CSS
- Prisma ORM
- PostgreSQL
- JWT cookie auth (role-aware)

## Core Modules
- Authentication and session management
- Role-based access and dynamic sidebar menu
- Inventory management (residential + commercial in one unit model)
- Booking operations (Regular, Transfer, Cancel, Switching, Gift)
- Customer and nominee records
- Payment plans, installments, and receipts
- Audit logs and documents

## Recommended Deployment Topology
- App: Vercel or Node server
- Database: Managed PostgreSQL (Neon, Supabase, RDS, or Cloud SQL)
- File storage for documents: S3-compatible object storage
- Secrets manager for `DATABASE_URL` and `JWT_SECRET`

## Local Setup
1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` and `JWT_SECRET`.
3. Install dependencies:
   - `npm install`
4. Generate Prisma client:
   - `npm run prisma:generate`
5. Push schema:
   - `npm run prisma:push`
6. Seed default data:
   - `npm run prisma:seed`
7. Start app:
   - `npm run dev`

## Data Ingestion Plan for Excel
1. Build a one-time importer script under `scripts/import-inventory.mjs`.
2. Normalize values before insert:
   - Facing synonyms (`WEST OPENT` => `WEST_OPEN`)
   - Category typos (`CATOGERY` => `CATEGORY`)
   - Type typo (`PANT HOUSE` => `PENTHOUSE`)
3. Upsert sequence:
   - Project -> Tower -> Lookup tables -> Units
4. Validate uniqueness using composite key:
   - `(projectId, towerId, unitNo)`

## Validation & UX Standards
- **Single source of truth:** Zod schemas live under `src/lib/validations/`. The same rules should back `react-hook-form` on the client and server actions before any database write.
- **Field UX:** Every input should have a clear `placeholder`, optional `hint`, and animated error text (see `Field`, `SelectField`, `TextareaField`).
- **Feedback:** Global toasts via `sonner` (`Providers` in `src/app/layout.tsx`).
- **Motion:** Section and card entrance uses Framer Motion; keep motion subtle and respect `prefers-reduced-motion` in a later pass.

## Database Field Formatting
- Prefer `@db.VarChar(n)` on bounded business strings (names, codes, CNIC, emails) to match app validation and save space.
- Long text (notes) uses larger `VarChar` caps; consider `@db.Text` later for audit payloads if needed.
- Keep money in `Decimal(p,s)` — never floats.

## Security Baseline
- HttpOnly JWT cookie
- Server-side auth checks in middleware and route handlers
- Role checks before mutation endpoints
- Audit log on create/update/delete
- Prepared statements via Prisma

## Scale and Performance Notes
- Composite and filtered indexes are added on high-cardinality query fields (status/date, tower/floor, customer/date).
- Use pagination on all list views.
- Avoid N+1 by using Prisma includes/selects.
- Add caching for static lookups and dashboards.

## UI Direction
- Inspired by `mizan` component style:
  - glass cards
  - gradient accents
  - clean and readable table layouts
- Booking screen keeps your legacy field logic while modernizing spacing, validation, and readability.
