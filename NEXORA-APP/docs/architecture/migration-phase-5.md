# NEXORA Migration — Phase 5: Application Backend Integration

**Date:** 12 November 2026  
**Status:** Implemented in source; live database verification pending.

## Delivered

- Client and designer forms submit to `POST /api/applications`.
- API validates type-specific required fields, normalizes email, filters accepted keys and enforces field-size limits.
- Application records, initial status-history entries and audit events are inserted transactionally into PostgreSQL.
- Public references use cryptographically random identifiers. A separate high-entropy access code is returned once; only its SHA-256 hash is stored.
- Applicants can retrieve applicant-visible status history and withdraw non-terminal applications using reference plus access code.
- Public submission and tracking endpoints have rate limits and require the application's CSRF token.
- Administrator queue and detail pages call protected backend endpoints. Server-side role checks remain authoritative.
- Administrator decisions write public-safe status explanations separately from restricted internal reviewer notes.
- The active Phase 3 localStorage application intake/review handler has been removed from `app.js`.

## API

- `POST /api/applications`
- `POST /api/applications/:reference/status`
- `POST /api/applications/:reference/withdraw`
- `GET /api/admin/applications`
- `GET /api/admin/applications/:reference`
- `POST /api/admin/applications/:reference/decision`

All mutating requests require a CSRF token. Administrator endpoints require an active administrator session.

## Database

Apply `schema/application-schema.sql`, `migrations/002_authentication_and_access_control.sql`, then `migrations/003_server_side_applications.sql`. Migration 003 adds the access-token hash and restricted internal review note. It also adds a partial unique index to prevent concurrent duplicate active applications for the same normalized email and application type. Check existing data for duplicates before applying this unique index to any database that has already accepted records.

## Security decisions

- A public reference alone does not authorize status lookup.
- Applicant access codes are not stored in plaintext and are not recoverable by NEXORA.
- Applicant status responses never return the full application payload or internal reviewer notes.
- Admin review is enforced by backend middleware, not by hidden navigation.
- Client and designer applications do not automatically activate accounts. Account registration remains a separate Phase 4 action after approval.

## Verification and limitations

Static frontend checks pass; all five frontend JavaScript files pass Node syntax checks; eight backend architecture tests pass. TypeScript typecheck could not be completed because backend dependencies and Node type declarations are not installed in the supplied environment. No PostgreSQL instance was available, so migrations and live HTTP/database flows were not executed. Email verification, notifications, secure uploads, password recovery, MFA, retention automation and deployment hardening remain outstanding. This phase is not production certification.


## Owner dashboard follow-up

The protected Owner Control Centre was added at `frontend/pages/owner/dashboard.html`. Login and account activation routing now send the `owner` role to this page. The application review page accepts both Owner and delegated administrator sessions. See `docs/architecture/owner-dashboard.md` for implemented dashboard functions and remaining limitations.
