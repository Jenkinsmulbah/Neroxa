# NEXORA API — Phase 4

Phase 4 introduces the server-side authentication and access-control foundation. The API is a TypeScript/Express modular monolith backed by PostgreSQL.

## Included

- Password-based login using bcrypt hashes (12 rounds).
- Account activation only against an approved, database-backed client or designer application.
- Role assignment from application type; applicants cannot choose their own role.
- Client and designer roles plus a distinct Owner principal and delegated administrator accounts. The Owner is represented by a protected singleton `owner_configuration` record; the underlying `users.role` remains `admin` for compatibility with the existing PostgreSQL enum. The API resolves that principal as `owner` at authentication time.
- PostgreSQL-backed, HTTP-only, SameSite=Lax sessions; session ID regeneration after login/registration.
- CSRF token validation for state-changing requests and strict configured CORS origin.
- Role middleware that rechecks account status and role in PostgreSQL on protected API requests.
- Authentication and general API rate limits, Helmet security headers, request size limit and generic production errors.
- Permission-gated application and account-management endpoints. Delegated administrators have no permissions by default; the Owner grants individual permissions. Owner-only routes manage administrator invitations, permissions and account status.
- Audit records for account creation, login, application decisions, account status and identity-verification status changes.
- Identity verification state stored separately from application approval and account activation.

## Requirements

- Node.js 20 or later.
- PostgreSQL 13 or later (PostgreSQL 16+ recommended).
- A frontend static server whose exact origin matches `FRONTEND_ORIGIN`.

## Initial setup

1. Create a PostgreSQL database and a least-privilege database role for the API.
2. Apply `database/schema/application-schema.sql` first, then `database/migrations/002_authentication_and_access_control.sql`, then `database/migrations/003_server_side_applications.sql`, then `database/migrations/004_owner_and_delegated_administration.sql`. Apply migrations in order; take a backup first.
3. Copy `.env.example` to `.env` and set real values. Generate a high-entropy session secret; never commit `.env`.
4. From this directory run `npm install`, `npm run typecheck`, `npm test`, and `npm run build`.
5. Provision the single Owner from a secure shell using `OWNER_EMAIL`, `OWNER_FULL_NAME`, and a unique `OWNER_PASSWORD` of at least 16 characters, then run `npm run owner:bootstrap`. This is a one-time operation. Remove the password from the shell environment afterward. Do not create an Owner through public registration.
6. Start with `npm run dev` for local development or `npm start` after building.
7. Serve the frontend through a local web server (not `file://`). The auth pages currently point to `http://localhost:4000`; change their `meta[name="nexora-api"]` content to the deployed API origin for staging/production.

## Environment

`NODE_ENV`, `PORT`, `DATABASE_URL`, `SESSION_SECRET`, `FRONTEND_ORIGIN`, `COOKIE_SECURE`, `TRUST_PROXY`, and `SESSION_MAX_AGE_HOURS` are validated at startup. Production requires `COOKIE_SECURE=true` and HTTPS. Set `TRUST_PROXY=true` only when the API is behind a correctly configured trusted reverse proxy.

## API surface

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | API/database health |
| GET | `/api/auth/csrf` | Public | Issue session-bound CSRF token |
| POST | `/api/auth/register` | Public + CSRF | Activate account from approved application reference |
| POST | `/api/auth/login` | Public + CSRF | Authenticate and create session |
| POST | `/api/auth/logout` | Session + CSRF | Destroy session |
| GET | `/api/auth/me` | Authenticated | Return current account and role |
| GET | `/api/client/overview` | Client/admin | Protected client API boundary |
| GET | `/api/team/overview` | Designer/admin | Protected team API boundary |
| POST | `/api/applications` | Public + CSRF + rate limit | Submit a client or designer application; returns one-time access code |
| POST | `/api/applications/:reference/status` | Reference + access code + CSRF + rate limit | Retrieve applicant-visible status history |
| POST | `/api/applications/:reference/withdraw` | Reference + access code + CSRF + rate limit | Withdraw a non-terminal application |
| GET | `/api/admin/applications` | Owner or `applications.read` | Filtered, paginated application queue |
| GET | `/api/admin/applications/:reference` | Owner or `applications.read` | Full application and restricted review history |
| POST | `/api/admin/applications/:reference/decision` | Owner or `applications.decide` + CSRF | Record database-backed application decision |
| GET | `/api/admin/users` | Owner or `users.read` | List accounts (first 200) |
| PATCH | `/api/admin/users/:id/account-status` | Owner or `users.manage_status` | Activate, suspend or disable account |
| PATCH | `/api/admin/users/:id/identity-verification` | Owner or `users.verify_identity` | Update separate identity-verification state |

For every POST/PATCH request, first obtain `/api/auth/csrf` using the same cookie jar and send the returned value in `X-CSRF-Token`.

## Account activation rules

An applicant cannot create an account by selecting a role. Registration requires all of the following:

- A real database application reference.
- Application status exactly `Approved`.
- Email address matching the application email (case-insensitive).
- An applicant name present in the stored application data.
- A password meeting the backend policy.

The backend derives `client` or `designer` from `application_type`. Admin accounts are created only through the administrative bootstrap script. Account activation does not imply identity verification: newly activated accounts start at `unverified`.

## Important current limitations

- Phase 3 localStorage application records are legacy browser data and are not imported. Phase 5 active application forms, private status tracking, withdrawal and administrator review pages use PostgreSQL-backed API endpoints.
- Client/team dashboards are protected by a browser-side navigation guard, but static HTML itself is not a security boundary. Production deployment must protect all sensitive data and operations at the API layer; do not serve sensitive records as static files.
- Password reset, email verification, email/WhatsApp notifications, MFA, identity-document review, project data APIs, payment processing and production deployment are not implemented in this phase.
- The API does not automatically prove ownership of an email address. Matching the approved application email is an application control, not email verification.
- Configure TLS, database backups, secret rotation, monitoring, log retention, dependency scanning and a production incident process before launch.


## Owner governance and delegated administration (Phase 5 revision)

The Owner is a distinct, protected principal resolved from the single row in `owner_configuration`. The Owner is not a second public role-registration option. The underlying account remains `admin` in the original PostgreSQL enum for migration compatibility; authentication middleware resolves the configured Owner as `owner`. A unique singleton configuration and database triggers protect the Owner account from deletion, demotion, deactivation, and replacement. The Owner configuration itself is immutable through ordinary application operations.

Bootstrap exactly once with `OWNER_EMAIL`, `OWNER_FULL_NAME`, and `OWNER_PASSWORD`, then `npm run owner:bootstrap`. Do not use the bootstrap script again after initial provisioning. There is no public administrator registration. The Owner invites administrators using `POST /api/owner/administrators/invitations`; the response contains a one-time 72-hour acceptance token. Deliver that token securely out-of-band. The invitee sets a password through `POST /api/auth/accept-administrator-invitation`. Invitation acceptance creates only a subordinate `admin` account and grants only the permissions selected by the Owner.

Owner-only API: `GET /api/owner/administrators`, `POST /api/owner/administrators/invitations`, `PATCH /api/owner/administrators/:id/permissions`, and `PATCH /api/owner/administrators/:id/account-status`. Permission grants are checked against PostgreSQL on every protected request; no frontend visibility control is treated as authorization. Current permission catalogue: `applications.read`, `applications.review`, `applications.decide`, `users.read`, `users.manage_status`, `users.verify_identity`, and `audit.read`. Owner bypasses these permission grants. Delegated administrators cannot manage Owner or administrator accounts through general account endpoints.

Audit rows are append-only at the database trigger level. Owner permission changes, invitations, account status changes, application decisions and other audited actions record the actor and target. Suspension/deactivation deletes matching persisted sessions; account status is also checked on every authenticated request. For production, use a dedicated least-privilege database role, protect database credentials, enforce MFA for Owner and administrators, and test the migration and trigger behavior on a staging PostgreSQL instance before deployment.

**Current limitation:** the Owner API is implemented, but a complete Owner-facing graphical management dashboard and invitation delivery service are not included in this phase. The invitation token is returned once by the API for secure manual delivery. Administrative audit viewing endpoint and fine-grained resource scopes are future work; current grants are permission-level, not per-record scopes.
