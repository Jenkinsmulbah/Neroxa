# NEXORA System Architecture

## Architectural style
NEXORA is planned as a modular monolith: one deployable backend with bounded business modules, one frontend, a relational database, and object storage. This is a target architecture, not an implemented production system.

## Application surfaces
- Public website: visitors, service information, and application entry points.
- Client portal: approved clients, business profiles, service requests, projects, reviews, and deliverables.
- Team workspace: approved designers and authorized assignments.
- Administration: application review, client/team management, project operations, quality control, and audit visibility.

## Trust boundaries
The browser is untrusted. Authentication, role checks, application decisions, assignment authorization, payment state, and file access must be enforced by the backend. Frontend route hiding is not authorization.

## Planned backend modules
Authentication, users, roles, applications, clients, businesses, designers, services, projects, assignments, submissions, revisions, files, payments, notifications, and audit logs.

## Data and files
PostgreSQL is the proposed system of record. User-uploaded assets and deliverables should use private object storage with server-issued, time-limited access.

## Current implementation boundary
Phase 4 adds an initial TypeScript/Express API, PostgreSQL-backed session and user schema, approved-application account activation, role middleware, CSRF protection, and audit logging. The backend has not been installed, deployed or tested against a live PostgreSQL database in this environment. Phase 3 application intake/review still uses browser localStorage and is not yet connected to the API. The editor remains browser-local; cloud object storage, payment integration, password recovery, email verification, notifications and production deployment remain outstanding.
