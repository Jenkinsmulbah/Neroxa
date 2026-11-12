-- NEXORA Phase 5 revision: single protected Owner and least-privilege administrators.
-- Apply after 003. Back up the database before applying.
CREATE TABLE IF NOT EXISTS owner_configuration (
 singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
 owner_user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
 configured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS permissions (code VARCHAR(100) PRIMARY KEY, description TEXT NOT NULL);
INSERT INTO permissions(code,description) VALUES
('applications.read','Read application queue and details'),('applications.review','Add internal review notes'),('applications.decide','Decide application status'),('users.read','Read client and designer accounts'),('users.manage_status','Change client and designer account status'),('users.verify_identity','Update identity verification'),('audit.read','Read administrative audit history') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS administrator_permission_grants (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), administrator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 permission_code VARCHAR(100) NOT NULL REFERENCES permissions(code) ON DELETE RESTRICT,
 granted_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, revoked_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
 UNIQUE(administrator_user_id,permission_code), CHECK(expires_at IS NULL OR expires_at > granted_at)
);
CREATE INDEX IF NOT EXISTS admin_permission_active_idx ON administrator_permission_grants(administrator_user_id,permission_code) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS administrator_invitations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email VARCHAR(254) NOT NULL, full_name VARCHAR(160) NOT NULL,
 token_hash CHAR(64) NOT NULL UNIQUE, invited_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 expires_at TIMESTAMPTZ NOT NULL, accepted_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, initial_permissions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(initial_permissions)='array'), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_invitation_email_idx ON administrator_invitations(lower(email));
CREATE OR REPLACE FUNCTION nexora_protect_owner_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND EXISTS(SELECT 1 FROM owner_configuration WHERE owner_user_id=OLD.id) THEN RAISE EXCEPTION 'The NEXORA Owner account cannot be deleted'; END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM owner_configuration WHERE owner_user_id=OLD.id) AND (NEW.id<>OLD.id OR NEW.role<>'admin' OR NEW.account_status<>'active') THEN RAISE EXCEPTION 'The NEXORA Owner identity and active status are protected'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS protect_nexora_owner_identity ON users;
CREATE TRIGGER protect_nexora_owner_identity BEFORE UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION nexora_protect_owner_identity();
CREATE OR REPLACE FUNCTION nexora_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit history is append-only'; END $$;
DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION nexora_audit_append_only();
COMMENT ON TABLE owner_configuration IS 'Exactly one configured Owner principal, created only by secure bootstrap.';
COMMENT ON TABLE administrator_permission_grants IS 'Individual Owner-issued permissions for subordinate administrators.';

CREATE OR REPLACE FUNCTION nexora_lock_owner_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Owner configuration is immutable through application operations'; END $$;
DROP TRIGGER IF EXISTS lock_owner_configuration ON owner_configuration;
CREATE TRIGGER lock_owner_configuration BEFORE UPDATE OR DELETE ON owner_configuration FOR EACH ROW EXECUTE FUNCTION nexora_lock_owner_configuration();
