# Prisma Migrations: Safety and CI Guardrails

This document outlines how we apply Prisma migrations to staging safely, and the guardrails enforced by CI to prevent unintended data loss.

## Principles

- Use `prisma migrate deploy` in CI/CD. Do not use `prisma migrate dev` in CI.
- Default to fail on destructive DDL (drops/truncate). Require explicit approval to proceed.
- Prefer backwards-compatible, zero-downtime “expand-contract” migrations for breaking changes.
- Keep separate database URLs:
  - `DATABASE_URL`: pooled (pgbouncer) for app/runtime.
  - `DIRECT_URL`: direct connection for Prisma Migrate.

## Environment (.env.staging.example)

- `DATABASE_URL`: `...:6543/... ?pgbouncer=true` (pooled)
- `DIRECT_URL`: `...:5432/...` (direct for migrations)

Configure corresponding GitHub Action secrets:
- `DATABASE_URL`
- `DIRECT_URL`
- `ALLOW_DESTRUCTIVE` (optional; leave unset or "false" by default)

## CI Workflow

File: `.github/workflows/staging.yml`

What it does:
- Installs deps, runs `npx prisma generate`.
- Scans `prisma/migrations/*/migration.sql` for destructive DDL:
  - `DROP TABLE`, `DROP COLUMN`, `DROP CONSTRAINT`
  - `TRUNCATE`
  - `ALTER TABLE ... DROP ...`
  - `... CASCADE` only when attached to the above drops
- If any found and `ALLOW_DESTRUCTIVE != "true"`, it fails the job.
- Runs `npx prisma migrate deploy` when safe.

Why we ignore FK `ON DELETE/UPDATE CASCADE`:
- These clauses are common in Prisma-generated FKs and are not schema-destructive. They affect runtime delete behavior, not migration-time DDL removal. Our guard only flags true drops/truncate.

## Expand-Contract Pattern (Recommended)

When making breaking changes, split into multiple safe steps:

1. Expand (non-breaking)
   - Add new tables/columns as nullable or with safe defaults.
   - Deploy code that can read/write both new and old schema shapes (dual-write if needed).

2. Backfill
   - Use a background job or an explicit SQL `UPDATE` migration to backfill data into new columns/tables.

3. Cutover
   - Update application reads/writes to use the new schema exclusively.

4. Contract (destructive — requires approval)
   - Remove old columns/indexes/tables in a later migration. This will be flagged by CI and requires setting `ALLOW_DESTRUCTIVE=true` for the run.

## Operational Guidance

- Always review migration SQL in PRs. Keep migrations small and focused.
- Keep backups and/or PITR enabled for staging (and production).
- For complex migrations, consider rehearsing against a disposable database in CI.
- Document any intended destructive change in the PR description and set `ALLOW_DESTRUCTIVE=true` only after review.

## Commands

- Status: `npx prisma migrate status`
- Generate: `npx prisma generate`
- Apply (CI): `npx prisma migrate deploy`
