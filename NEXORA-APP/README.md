# NEXORA

NEXORA is a managed digital creative agency supported by a web platform. It connects businesses to an internally managed creative team through structured applications, project briefs, design review and delivery.

## Project architecture

- `frontend/` — public pages, client/team/admin interfaces, assets and browser API clients.
- `backend/` — Node.js, TypeScript and Express API; authentication, applicant intake, administrator review and audit logging.
- `database/` — PostgreSQL base schema and ordered migrations.
- `storage/` — reserved for private object storage integration.
- `docs/` — business, architecture, access-control and migration records.
- `infrastructure/` — reserved deployment and operations configuration.

## Phase 5 implementation

Client and designer application forms now submit to `POST /api/applications`. Application records, status history and audit events are stored in PostgreSQL. The API issues a random one-time applicant access code; only its SHA-256 hash is stored. Applicants must supply both the reference and access code to retrieve status or withdraw an application. Administrator queue and detail pages use role-protected PostgreSQL-backed API endpoints. Review rationale is stored separately from applicant-visible status explanations.

The Phase 3 localStorage application intake and review code has been removed from the active frontend workflow. Existing browser-local demo records are not migrated.

## Database setup

Apply in order: `database/schema/application-schema.sql`, `database/migrations/002_authentication_and_access_control.sql`, then `database/migrations/003_server_side_applications.sql`. Review and test migrations against a disposable PostgreSQL database before any production use.

## Local verification

Run `python3 scripts/verify_phase5.py`, `npm test --prefix backend`, and `npm run typecheck --prefix backend`. The static checks do not replace a live PostgreSQL integration test or a security review.

## Production limitations

This phase is not a production deployment. Configure a real PostgreSQL database, strong environment secrets, HTTPS, a secure same-origin frontend/API deployment or explicitly configured CORS origin, backups, monitoring, privacy retention controls and tested restore procedures. Email/WhatsApp notifications, applicant email verification, uploads, malware scanning, password recovery, MFA, and real-world operational policies remain unimplemented. Do not collect real applicant data until the backend is deployed, migrations are tested, and privacy/security controls are reviewed.

## Owner dashboard

The protected Owner Control Centre is available at `frontend/pages/owner/dashboard.html`. Successful Owner login redirects to this page. It uses the authenticated `/api/auth/me` endpoint and Owner-protected administrator management routes. The dashboard provides administrator invitations, permission updates, account suspension/reactivation, application counts, and recent audit activity. The interface is an operational starting point; it does not imply that project, finance, reporting, or security-management modules are complete.
