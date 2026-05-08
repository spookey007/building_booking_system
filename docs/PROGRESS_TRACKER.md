# Progress Tracker

## Overall Status
In progress — quality bar: **production-grade** UX, validation, and data integrity.

## Phase Breakdown
- [x] Analyze provided Excel workbook structure
- [x] Design scalable ERD and long-term schema strategy
- [x] Add production-oriented Prisma schema with enums and indexes
- [x] Add auth/session foundation with role context
- [x] Build dynamic role-driven sidebar framework
- [x] Create modern booking form including switch mode options (Regular, Transfer, Cancel, Switching, Gift)
- [x] Add initial dashboard pages (units, bookings, customers, payments, settings)
- [x] Add project guide documentation
- [x] **Form polish:** Zod validation (client + server), helpful placeholders, hints, animated field errors (Framer Motion), Sonner toasts
- [x] **Database polish:** `VarChar` lengths on core text fields, bidirectional `Project` ↔ `Booking` and `Unit` ↔ `SwitchToUnit` relations
- [ ] Wire **all** booking fields to Prisma create/update with transactions (unit status, customer upsert, nominee)
- [ ] Implement remaining CRUD server actions and consistent error mapping
- [ ] Build Excel import pipeline with normalization rules
- [ ] Add unit tests and integration tests
- [ ] Add CI checks and deployment workflow

## Quality / “Top notch” checklist (ongoing)
- [x] Shared validation rules in `src/lib/validations/*` (reuse on client and server)
- [x] Login validated with Zod on the server; field-level errors on the UI
- [x] Booking form: `react-hook-form` + Zod resolver; server action re-validates payload
- [ ] Every future form: same pattern (schema → resolver → server action)
- [ ] Database: migration history + seed role-menu mappings for all roles
- [ ] Accessibility pass (labels, `aria-invalid`, focus order)
- [ ] Performance: list pagination, avoid over-fetching

## Immediate Next Tasks
1. Run `npm install` (ensure `sonner` is installed) then `npm run prisma:generate`.
2. Create first migration after VarChar / relation updates: `npm run prisma:migrate`.
3. Persist booking: resolve `projectId`, `unitId`, `customerId`, map financial fields to `Booking` decimals.
4. Seed role ↔ menu rows in DB so sidebar is 100% data-driven.
5. Add search, pagination, and filters on inventory and booking lists.

## Decisions Locked
- Single `Unit` model supports both apartments and shops (`UnitKind`).
- Booking mode enum: Regular, Transfer, Cancel, Switching, Gift.
- Role-based navigation uses DB mapping with sensible fallbacks.
- Money and area: `Decimal` in PostgreSQL; Zod enforces non-negative numeric rules before persistence.
