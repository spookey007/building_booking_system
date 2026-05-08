# Database Schema (Optimized)

## Design Goals
- Handle both apartments and shops cleanly
- Preserve booking workflow from legacy form
- Scale query performance with deliberate indexes
- Keep data integrity with strict relations and enums

## ER Diagram
```mermaid
erDiagram
    USERS ||--o{ USER_ROLES : has
    ROLES ||--o{ USER_ROLES : assigned
    ROLES ||--o{ ROLE_PERMISSIONS : grants
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : includes
    ROLES ||--o{ ROLE_MENU_ITEMS : controls
    MENU_ITEMS ||--o{ ROLE_MENU_ITEMS : allows

    PROJECTS ||--o{ TOWERS : contains
    PROJECTS ||--o{ UNITS : contains
    TOWERS ||--o{ UNITS : has
    UNIT_CATEGORIES ||--o{ UNITS : classifies
    FACING_TYPES ||--o{ UNITS : faces

    CUSTOMERS ||--o{ NOMINEES : has
    CUSTOMERS ||--o{ BOOKINGS : places
    USERS ||--o{ BOOKINGS : creates
    UNITS ||--o{ BOOKINGS : booked_for
    UNITS ||--o{ BOOKINGS : switch_target

    BOOKINGS ||--|| PAYMENT_PLANS : has
    PAYMENT_PLANS ||--o{ PAYMENT_INSTALLMENTS : schedules
    BOOKINGS ||--o{ PAYMENTS : receives
    PAYMENT_INSTALLMENTS ||--o{ PAYMENTS : settles
    USERS ||--o{ AUDIT_LOGS : actor
    USERS ||--o{ DOCUMENTS : uploads
```

## High-Impact Indexes
- `Unit`: `(unitKind, listingStatus)`, `(towerId, floorNo)`, `(projectId, serialNo)`, unique `(projectId, towerId, unitNo)`
- `Booking`: `(status, bookingDate)`, `(mode, bookingDate)`, `(unitId, status)`, `(customerId, bookingDate)`
- `PaymentInstallment`: `(status, dueDate)`
- `Payment`: `(bookingId, paymentDate)`, `(mode, paymentDate)`
- `Customer`: name/phone/cnic search indexes
- `AuditLog`: entity and actor timeline indexes

## Field Quality and Normalization
- Money and area values use `Decimal` instead of float
- Enums used for:
  - `BookingMode`
  - `BookingStatus`
  - `UnitKind`
  - `UnitListingStatus`
  - `PaymentMode`
- Legacy text anomalies should be normalized during import

## Booking Mode Mapping
- REGULAR
- TRANSFER
- CANCEL
- SWITCHING
- GIFT
