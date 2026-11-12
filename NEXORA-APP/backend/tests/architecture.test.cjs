const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('public registration derives role from approved application', () => {
  const source = read('backend/src/modules/auth/auth.service.ts');
  assert.match(source, /record\.status !== 'Approved'/);
  assert.match(source, /record\.application_type === 'client' \? 'client' : 'designer'/);
  assert.match(source, /applicant_email\.toLowerCase\(\) !== email\.toLowerCase\(\)/);
});

test('administrator authorization is enforced by server middleware', () => {
  const source = read('backend/src/modules/applications/admin.routes.ts');
  assert.match(source, /adminRouter\.use\(requireAdministrator\(\)\)/);
  assert.match(source, /requirePermission\('applications.read'\)/);
});

test('identity verification is distinct from account and application status', () => {
  const source = read('database/migrations/002_authentication_and_access_control.sql');
  assert.match(source, /identity_verification_status identity_verification_status/);
  assert.match(source, /account_status account_status/);
  assert.match(source, /application_id UUID UNIQUE/);
});

test('session cookies are HTTP-only and SameSite Lax', () => {
  const source = read('backend/src/app.ts');
  assert.match(source, /httpOnly: true/);
  assert.match(source, /sameSite: 'lax'/);
  assert.match(source, /new PgSession/);
});


test('public application intake is database-backed and rate-limited', () => {
  const source = read('backend/src/modules/applications/applicant.routes.ts');
  assert.match(source, /INSERT INTO applications/);
  assert.match(source, /applicant_access_token_hash/);
  assert.match(source, /submissionLimiter/);
  assert.match(source, /crypto\.randomBytes\(32\)/);
});

test('applicant tracking requires a private token and does not return application payload', () => {
  const source = read('backend/src/modules/applications/applicant.routes.ts');
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /applicant_access_token_hash/);
  assert.doesNotMatch(source, /res\.json\(\{[^}]*application_data/);
});

test('administrator application queue and detail are protected', () => {
  const source = read('backend/src/modules/applications/admin.routes.ts');
  assert.match(source, /adminRouter\.use\(requireAdministrator\(\)\)/);
  assert.match(source, /requirePermission\('applications.read'\)/);
  assert.match(source, /adminRouter\.get\('\/applications'/);
  assert.match(source, /adminRouter\.get\('\/applications\/:reference'/);
});

test('applicant-visible notes are separated from internal review notes', () => {
  const migration = read('database/migrations/003_server_side_applications.sql');
  const admin = read('backend/src/modules/applications/admin.routes.ts');
  assert.match(migration, /internal_note TEXT/);
  assert.match(admin, /applicantMessages\[status\]/);
  assert.match(admin, /internal_note/);
});


test('Owner is a distinct protected role with a single-owner database constraint', () => {
 const roles=read('backend/src/shared/roles.ts'); const migration=read('database/migrations/004_owner_and_delegated_administration.sql');
 assert.match(roles,/owner/); assert.match(migration,/owner_configuration/); assert.match(migration,/nexora_protect_owner_identity/);
});
test('subordinate administrator permissions are checked against live database grants', () => {
 const middleware=read('backend/src/middleware/authenticate.ts');
 assert.match(middleware,/administrator_permission_grants/); assert.match(middleware,/user.role === 'owner'/); assert.match(middleware,/user.role !== 'admin'/);
});
test('only Owner can access delegated administrator management routes', () => {
 const routes=read('backend/src/modules/auth/owner.routes.ts');
 assert.match(routes,/ownerRouter.use\(requireRoles\('owner'\)\)/); assert.match(routes,/ADMIN_PERMISSIONS_REPLACED/); assert.match(routes,/ADMIN_INVITATION_CREATED/);
});
test('public administrator invitation acceptance cannot select permissions or role', () => {
 const routes=read('backend/src/modules/auth/auth.routes.ts');
 assert.match(routes,/accept-administrator-invitation/); assert.match(routes,/'admin','active','unverified'/); assert.match(routes,/invitation.initial_permissions/);
});
test('audit records and owner configuration are protected from update and deletion', () => {
 const migration=read('database/migrations/004_owner_and_delegated_administration.sql');
 assert.match(migration,/audit_logs_append_only/); assert.match(migration,/lock_owner_configuration/);
});
