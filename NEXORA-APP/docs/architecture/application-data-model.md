# NEXORA Application Management — Data Model and Workflow

Version: 1.0  
Status: Phase 3 design baseline; production implementation pending.

## 1. Scope

Phase 3 establishes structured client and designer application intake, applicant reference tracking, administrator review actions, status history, and an initial persistence contract. The current browser implementation uses `localStorage` solely to demonstrate the workflow. It is not secure, shared, backed up, authenticated, or suitable for real applicant data.

## 2. Application lifecycle

Allowed statuses:

- `Submitted`
- `Under Review`
- `More Information Required`
- `On Hold`
- `Approved`
- `Rejected`
- `Withdrawn`

Every transition must append an immutable history event containing the prior status, new status, actor user ID, timestamp, and a reason or note. Terminal decisions (`Approved`, `Rejected`, `Withdrawn`) should not be silently overwritten. Reopening a terminal application must be an explicit, separately permissioned action with its own audit event.

Submission is not account activation. An approved application may proceed to a separate account-provisioning or invitation process. Application approval and identity/business verification are separate records and decisions.

## 3. Applicant data principles

- Collect only information necessary to evaluate the proposed client or designer relationship.
- Do not collect passwords, bank credentials, government ID numbers, health data, or other sensitive information in the application form.
- Do not require formal business registration as a universal client eligibility condition.
- Evaluate a business in context; early-stage, small, and unregistered businesses are not automatically unsuitable.
- Evaluate designers using work evidence, skill, reliability, communication, and availability; credentials and years of experience are supporting context rather than sole gates.
- A practical designer assessment must use a fictional brief and must not produce unpaid commercial work for an actual client.
- Portfolio links must be reviewed for ownership, permission, and third-party asset disclosure.

## 4. Core entities

### `applications`

- `id`: UUID primary key.
- `reference`: unique, non-sequential public reference; never use it as authorization.
- `application_type`: `client` or `designer`.
- `applicant_user_id`: nullable until secure account association exists.
- `applicant_email`: normalized email used for contact and duplicate detection.
- `status`: constrained lifecycle value.
- `application_data`: validated JSONB payload with type-specific schema.
- `submitted_at`, `updated_at`, `decided_at`: timestamps.
- `assigned_reviewer_user_id`: nullable administrator/reviewer reference.

### `application_status_history`

- `id`: UUID primary key.
- `application_id`: foreign key to applications.
- `from_status`, `to_status`: lifecycle transition.
- `actor_user_id`: authenticated actor; system actor must be explicit.
- `note`: required factual decision note for human review actions.
- `created_at`: server-generated timestamp.

### `application_reviews`

Optional structured review records for rubric-based assessment. Store reviewer, criterion, score, evidence note, and timestamp. Do not expose internal reviewer notes to applicants by default.

### `verification_records`

Separate from application approval. Stores verification type, status, evidence reference, reviewer, timestamps, and decision note. Do not store raw identity-document contents in ordinary application JSON.

## 5. Client application payload

Expected fields include applicant name, email, phone, preferred contact method, location, business name, industry, business stage, registration status, launch date, website and public links, business description, target audience, marketing channels, existing brand materials, requested services, goals, desired start timing, request frequency, indicative budget range, decision-making role, and additional context.

The budget field is optional and must not be used as an automatic rejection threshold. Registration status is contextual information, not an automatic eligibility gate.

## 6. Designer application payload

Expected fields include full name, email, phone, location, professional headline, portfolio URL and work sample links, professional introduction, specialties, practical experience, education/training, software proficiency, project examples and contribution, availability, hours per week, equipment/internet access, earliest start date, feedback/revision approach, deadline-risk response, and professional acknowledgments covering originality, confidentiality, conduct, and accuracy.

## 7. Suggested API contract

Applicant-facing endpoints:

- `POST /api/v1/applications` — validate and submit an application; return reference and initial status.
- `GET /api/v1/applications/me` — list applications belonging to the authenticated applicant.
- `GET /api/v1/applications/me/:id` — retrieve an applicant-owned application and applicant-visible history.
- `POST /api/v1/applications/me/:id/withdraw` — request withdrawal under policy.

Administrator-only endpoints:

- `GET /api/v1/admin/applications` — filter and paginate the review queue.
- `GET /api/v1/admin/applications/:id` — retrieve full authorized review record.
- `POST /api/v1/admin/applications/:id/transitions` — request a permitted status transition with required note.
- `POST /api/v1/admin/applications/:id/assign-reviewer` — assign an authorized reviewer.

Every endpoint requires server-side authentication, authorization, schema validation, rate limiting where appropriate, and audit logging. Applicant reads must enforce ownership; administrator routes must enforce an explicit permission, not merely hide links in the frontend.

## 8. Production controls still required

- Server-side schema validation and normalization.
- Verified account association and secure applicant access.
- Administrator authentication, role/permission checks, and MFA policy assessment.
- CSRF protection where cookie-based sessions are used; secure session cookies and session rotation.
- Rate limiting, abuse prevention, and duplicate/submission handling.
- Encryption in transit and appropriate encryption at rest.
- Private object storage and malware/type/size checks if uploads are later introduced.
- Audit-log integrity and restricted access to reviewer notes.
- Retention, deletion, correction, and privacy-request procedures.
- Backups, restore tests, monitoring, and incident response.

## 9. Prototype limitations

The Phase 3 demo stores records in the current browser profile's `localStorage`. There is no real administrator identity, no shared queue across devices, no server-generated timestamp, no durable audit log, no email or WhatsApp notification, and no production account approval. Anyone with access to that browser profile can inspect or alter the data. Use fictional test entries only.
