# NEXORA Owner and Delegated Administration Architecture

## Principal model

NEXORA has exactly one Owner principal. The Owner is identified by the singleton row in `owner_configuration`; the original `user_role` enum remains unchanged for migration compatibility, and the configured Owner's API role is resolved as `owner` during authentication. The Owner's underlying `users.role` remains `admin`. A partial unique enum index is deliberately not used: the singleton primary key and unique `owner_user_id` establish the one-owner invariant without requiring an enum alteration that may be unsafe inside transactional migration runners.

The Owner is provisioned once through `backend/scripts/create-owner.ts`. Public registration derives only `client` or `designer` from an approved application. No public route can select `admin` or `owner`.

## Delegated administrators

The Owner creates time-limited invitations and selects an initial set of permissions. The invitation token is generated with a cryptographically secure random generator; only its SHA-256 digest is stored. The plaintext token is returned once for secure out-of-band delivery. Invitation acceptance creates an `admin` account and applies only the Owner-selected grants. Administrators receive no implicit permissions.

Permissions currently implemented:

- `applications.read`
- `applications.review`
- `applications.decide`
- `users.read`
- `users.manage_status`
- `users.verify_identity`
- `audit.read`

Permission checks query PostgreSQL on each request. The Owner bypasses subordinate grants. The Owner-only management API can replace an administrator's permission set and suspend/disable the account. General account endpoints explicitly refuse to modify Owner or administrator accounts.

## Protected operations

- Owner account cannot be deleted, demoted, or deactivated by ordinary SQL operations while the protection trigger is enabled.
- Owner configuration cannot be updated or deleted through ordinary SQL operations while its protection trigger is enabled.
- Delegated administrators cannot access Owner management routes.
- Administrators cannot grant themselves permissions; only Owner-only endpoints grant permissions.
- Audit log rows cannot be updated or deleted through ordinary SQL operations while the append-only trigger is enabled.
- Authentication middleware reloads account status and role on every protected request. Suspended/disabled administrators' stored sessions are also removed by the Owner status endpoint.

## API

Owner-only:

- `GET /api/owner/administrators`
- `POST /api/owner/administrators/invitations`
- `PATCH /api/owner/administrators/:id/permissions`
- `PATCH /api/owner/administrators/:id/account-status`

Public invitation acceptance:

- `POST /api/auth/accept-administrator-invitation`

Permission-gated administrative:

- `GET /api/admin/applications` — `applications.read`
- `GET /api/admin/applications/:reference` — `applications.read`
- `POST /api/admin/applications/:reference/decision` — `applications.decide`
- `GET /api/admin/users` — `users.read`
- `PATCH /api/admin/users/:id/account-status` — `users.manage_status`
- `PATCH /api/admin/users/:id/identity-verification` — `users.verify_identity`
- `GET /api/admin/audit` — `audit.read`

The Owner can use all administrative routes. No frontend route hiding is treated as a security boundary.

## Operational safeguards and limitations

1. Back up PostgreSQL and apply migrations 001–004 in order in a staging environment first.
2. Run the one-time Owner bootstrap only after migration 004 is applied. Secure the bootstrap credentials and remove the password from the environment immediately afterward.
3. Require MFA for Owner and administrators before production; MFA is not implemented in this phase.
4. Invitation delivery is not integrated with email/WhatsApp. The Owner must securely deliver the one-time token.
5. Resource-level record scopes are not implemented yet; current authorization is permission-level. Introduce row/resource scoping as client, project, finance and support modules are built.
6. Audit append-only triggers protect against application-level update/delete operations, not a PostgreSQL superuser or infrastructure administrator. Production audit export/replication to a separate security-controlled system is recommended.
7. Database trigger and migration behavior has not been exercised against a live PostgreSQL server in this build environment. Validate on staging before production.
8. The Owner identity has no in-app transfer/recovery workflow. Any emergency recovery or ownership transfer must be a documented, controlled database-operator procedure with backups and a recorded incident/change ticket.
