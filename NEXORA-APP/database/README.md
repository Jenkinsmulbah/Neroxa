# Database setup

Apply database files in this exact order to a new database:

1. `schema/application-schema.sql`
2. `migrations/002_authentication_and_access_control.sql`
3. `migrations/003_server_side_applications.sql`

Record applied versions in deployment records. Back up the database and test the migration/rollback procedure before applying changes to an existing environment. Do not commit credentials. Phase 3 browser-local demo records are not automatically imported.
