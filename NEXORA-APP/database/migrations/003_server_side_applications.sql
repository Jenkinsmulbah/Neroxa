-- NEXORA Phase 5: PostgreSQL-backed applicant intake and private status tracking.
-- Apply after migrations 001/002 (application schema and authentication).
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS applicant_access_token_hash CHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS applications_active_email_type_idx
  ON applications (lower(applicant_email), application_type)
  WHERE status IN ('Submitted','Under Review','More Information Required','On Hold');

-- New submissions must carry a SHA-256 hash of a random applicant access token.
-- Existing localStorage demo records are not imported into this database.
COMMENT ON COLUMN applications.applicant_access_token_hash IS
  'SHA-256 hash of a high-entropy applicant status/withdrawal token; plaintext is returned once at submission and never stored.';

ALTER TABLE application_status_history
  ADD COLUMN IF NOT EXISTS internal_note TEXT;

COMMENT ON COLUMN application_status_history.note IS
  'Applicant-visible status explanation. Never store private reviewer rationale here.';
COMMENT ON COLUMN application_status_history.internal_note IS
  'Restricted administrator-only review rationale; never return this field to applicant status endpoints.';
