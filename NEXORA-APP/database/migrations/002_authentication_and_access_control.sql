-- NEXORA Phase 4: authentication, role-based authorization and audit records.
-- Apply after database/schema/application-schema.sql. Back up the database first.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('client', 'designer', 'admin');
CREATE TYPE account_status AS ENUM ('active', 'suspended', 'disabled');
CREATE TYPE identity_verification_status AS ENUM ('unverified', 'pending', 'verified', 'rejected');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(254) NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL,
  account_status account_status NOT NULL DEFAULT 'active',
  identity_verification_status identity_verification_status NOT NULL DEFAULT 'unverified',
  application_id UUID UNIQUE REFERENCES applications(id) ON DELETE RESTRICT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email));
CREATE INDEX users_role_status_idx ON users (role, account_status);

ALTER TABLE applications
  ADD CONSTRAINT applications_applicant_user_fk FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT applications_reviewer_user_fk FOREIGN KEY (assigned_reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE application_status_history
  ADD CONSTRAINT application_history_actor_user_fk FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE user_sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX user_sessions_expire_idx ON user_sessions (expire);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(60) NOT NULL,
  target_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT audit_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX audit_logs_target_idx ON audit_logs (target_type, target_id, created_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id, created_at DESC);

-- Identity verification is deliberately independent of application approval and account activation.
-- No identity document upload or automated identity-check provider is enabled in this phase.
