CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- NEXORA application-management schema baseline (PostgreSQL).
-- Review and adapt before production deployment; no backend currently executes this file.

CREATE TYPE application_type AS ENUM ('client', 'designer');
CREATE TYPE application_status AS ENUM (
  'Submitted',
  'Under Review',
  'More Information Required',
  'On Hold',
  'Approved',
  'Rejected',
  'Withdrawn'
);

CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference VARCHAR(32) NOT NULL UNIQUE,
  application_type application_type NOT NULL,
  applicant_user_id UUID NULL,
  applicant_email VARCHAR(254) NOT NULL,
  status application_status NOT NULL DEFAULT 'Submitted',
  application_data JSONB NOT NULL,
  assigned_reviewer_user_id UUID NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ NULL,
  CONSTRAINT applications_data_object CHECK (jsonb_typeof(application_data) = 'object')
);

CREATE INDEX applications_queue_idx ON applications (status, submitted_at DESC);
CREATE INDEX applications_type_idx ON applications (application_type, submitted_at DESC);
CREATE INDEX applications_email_idx ON applications (lower(applicant_email));

CREATE TABLE application_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  from_status application_status NULL,
  to_status application_status NOT NULL,
  actor_user_id UUID NULL,
  actor_kind VARCHAR(24) NOT NULL CHECK (actor_kind IN ('applicant', 'administrator', 'system')),
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX application_history_timeline_idx
  ON application_status_history (application_id, created_at ASC);

-- User foreign keys should be added after the users/identity schema is finalized.
-- Enforce allowed transitions in a backend service or database trigger; never trust the browser.
