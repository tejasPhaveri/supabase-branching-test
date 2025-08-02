# Prisma-Only Migrations: Safety and CI Guardrails

This document outlines our Prisma-only migration strategy with Supabase, and the guardrails enforced by CI to prevent unintended data loss.

## Migration Strategy

We use **Prisma-only migrations** to avoid conflicts between Prisma and Supabase migration systems. Supabase provides the database infrastructure (separate staging/production instances), while Prisma manages all schema changes.

## Principles

- Use `prisma migrate deploy` in CI/CD. Do not use `prisma migrate dev` in CI.
- Default to fail on destructive DDL (drops/truncate). Require explicit approval to proceed.
- Prefer backwards-compatible, zero-downtime "expand-contract" migrations for breaking changes.
- Keep separate database URLs:
  - `DATABASE_URL`: pooled (pgbouncer) for app/runtime.
  - `DIRECT_URL`: direct connection for Prisma Migrate.
- Do NOT use Supabase's automatic migration system to avoid conflicts.

## Environment (.env.staging.example)

- `DATABASE_URL`: `...:6543/... ?pgbouncer=true` (pooled)
- `DIRECT_URL`: `...:5432/...` (direct for migrations)

Configure corresponding GitHub Action secrets:

**Staging Environment (preview):**
- `STAGING_DATABASE_URL`
- `STAGING_DIRECT_URL`
- `STAGING_ALLOW_DESTRUCTIVE` (optional; leave unset or "false" by default)

**Production Environment:**
- `PRODUCTION_DATABASE_URL`
- `PRODUCTION_DIRECT_URL`

## CI Workflow

Files: `.github/workflows/staging.yml` and `.github/workflows/production.yml`

### Staging Workflow (Branch: `staging`)
- Installs deps, runs `npx prisma generate`.
- Scans `prisma/migrations/*/migration.sql` for destructive DDL:
  - `DROP TABLE`, `DROP COLUMN`, `DROP CONSTRAINT`
  - `TRUNCATE`
  - `ALTER TABLE ... DROP ...`
  - `... CASCADE` only when attached to the above drops
- If any found and `STAGING_ALLOW_DESTRUCTIVE != "true"`, it fails the job.
- Runs `npx prisma migrate deploy` against **staging database**.

### Production Workflow (Branch: `main` or `production`)
- Skips destructive checks (assumes staging validation passed).
- Applies the same migrations that were tested in staging.
- Runs `npx prisma migrate deploy` against **production database**.

Why we ignore FK `ON DELETE/UPDATE CASCADE`:
- These clauses are common in Prisma-generated FKs and are not schema-destructive. They affect runtime delete behavior, not migration-time DDL removal. Our guard only flags true drops/truncate.

## Data Migration Strategy: Expand-Contract Pattern

**CRITICAL**: Always preserve data during schema changes. Use the expand-contract pattern for breaking changes to achieve zero-downtime migrations.

### Three-Phase Migration Process

#### Phase 1: EXPAND (Always Safe)
- **Add new columns/tables** alongside existing ones
- **Use nullable columns** or provide safe default values
- **Create indexes** for new columns if needed
- **Deploy application code** that can read/write both old and new schemas

```sql
-- ✅ Safe expand example
ALTER TABLE users ADD COLUMN full_name TEXT;
CREATE INDEX idx_users_full_name ON users(full_name);
```

#### Phase 2: MIGRATE (Data Transformation)
- **Transform existing data** from old to new schema
- **Use UPDATE statements** with proper WHERE clauses
- **Create data migration scripts** within Prisma migrations
- **Implement dual-write patterns** in application code

```sql
-- ✅ Safe data migration example
UPDATE users 
SET full_name = CONCAT(first_name, ' ', last_name) 
WHERE full_name IS NULL AND first_name IS NOT NULL;
```

#### Phase 3: CONTRACT (Requires Approval)
- **Remove old columns/tables** after ensuring data migration is complete
- **This will be flagged by CI** and requires setting `STAGING_ALLOW_DESTRUCTIVE=true`
- **Requires thorough verification** that no application code references old schema

```sql
-- ⚠️ Destructive - requires approval
ALTER TABLE users DROP COLUMN first_name;
ALTER TABLE users DROP COLUMN last_name;
```

### Data Preservation Rules

1. **Never rename columns directly** - use expand-contract pattern instead
2. **Never change column types without data migration**
3. **Always provide default values** for new NOT NULL columns
4. **Test data migrations on staging** before production
5. **Use transactions** for complex data transformations

## Custom Migration Editing Workflow

For complex data transformations, edit migrations before applying:

1. **Create draft migration**:
   ```bash
   npx prisma migrate dev --create-only --name your_migration_name
   ```

2. **Edit the generated SQL file** in `prisma/migrations/[timestamp]_your_migration_name/migration.sql`

3. **Add data transformation logic**:
   ```sql
   -- Example: Safe column rename with data preservation
   ALTER TABLE users ADD COLUMN email_address TEXT;
   UPDATE users SET email_address = email WHERE email IS NOT NULL;
   -- Don't drop old column yet - save for contract phase
   ```

4. **Apply the edited migration**:
   ```bash
   npx prisma migrate dev
   ```

## Operational Guidance

- **Always review migration SQL** in PRs. Keep migrations small and focused.
- **Keep backups and/or PITR enabled** for staging (and production).
- **For complex migrations**, consider rehearsing against a disposable database in CI.
- **Document any intended destructive change** in the PR description and set `STAGING_ALLOW_DESTRUCTIVE=true` only after review.
- **Use the expand-contract pattern** for any breaking schema changes.
- **Never apply untested migrations** to production.
- **Monitor post-migration performance** and data integrity.

## Common Migration Commands

### Development
- **Check status**: `npx prisma migrate status`
- **Generate client**: `npx prisma generate`
- **Create migration**: `npx prisma migrate dev --name migration_name`
- **Create draft only**: `npx prisma migrate dev --create-only --name migration_name`
- **Reset database**: `npx prisma migrate reset` (⚠️ destroys data)

### Production (CI/CD)
- **Apply migrations**: `npx prisma migrate deploy`
- **Check diff**: `npx prisma migrate diff --from-url="$DATABASE_URL" --to-schema-datamodel=prisma/schema.prisma`

### Data Safety Commands
- **Introspect existing DB**: `npx prisma db pull`
- **Push schema changes**: `npx prisma db push` (⚠️ can cause data loss)
- **Validate schema**: `npx prisma validate`

## Emergency Procedures

### If Data Loss Occurs
1. **Stop all deployments immediately**
2. **Restore from most recent backup**
3. **Review migration that caused the issue**
4. **Implement proper expand-contract pattern**
5. **Re-test thoroughly before re-deployment**

### Schema Drift Resolution
1. **Use `npx prisma migrate resolve --applied`** for migrations applied outside Prisma
2. **Use `npx prisma db pull`** to sync schema with database
3. **Create baseline migration** if starting with existing database
