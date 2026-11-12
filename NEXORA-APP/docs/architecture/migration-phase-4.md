# NEXORA Migration — Phase 4: Authentication, Roles and Access Control

**Status:** Implemented as an initial backend foundation; deployment and integration remain outstanding.

## Scope delivered

1. Added a Node.js/TypeScript/Express API with PostgreSQL connection pooling.
2. Added users, role, account status, identity-verification status, session storage and audit-log schema migration.
3. Added approved-application-based account activation. Client/designer role is derived from the approved application; public registration cannot assign a role.
4. Added password hashing, login, logout, current-session endpoint and PostgreSQL-backed sessions.
5. Added CSRF protection, strict CORS origin, HTTP-only cookies, rate limits, security headers and request validation.
6. Added server-side role middleware and account-state revalidation on protected requests.
7. Added administrator-only application decision, account status and identity-verification endpoints.
8. Added frontend login/activation integration and role-based navigation guards for existing client, designer and administrator pages.

## Security model

- Authentication establishes the user identity; authorization checks the role and active account state on the server.
- A client application produces a client account only after its database record is approved. A designer application produces a designer account only after approval.
- Admin role assignment is not exposed in public registration; bootstrap is a controlled command-line operation.
- `identity_verification_status` is independent from application status and `account_status`.
- Sessions are opaque server-side records stored in PostgreSQL. Cookies are HTTP-only and SameSite=Lax. Login and registration regenerate the session identifier.
- State-changing API requests require a session-bound CSRF token.
- Administrative decisions and account-state changes create audit records.

## Integration boundary

The current Phase 3 intake and review screens still write to localStorage. They cannot create database applications and must not be mistaken for a working end-to-end approval workflow. The new API's application decision endpoint only works with PostgreSQL application records. Phase 5 must migrate application creation, status lookup, and admin review to the API/database, then remove the localStorage application workflow.

## Validation performed

Static verification is performed by `scripts/verify_phase4.py` and JavaScript syntax checks. Full TypeScript compilation, dependency installation, PostgreSQL migration execution, session behavior and end-to-end security tests require a configured Node/PostgreSQL environment and are not represented as passed unless run there.
