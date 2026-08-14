-- DB-ROLE-HARDENING — creates aaramva_app (non-superuser) and reassigns
-- ownership of every app object to it. See docs/ops/DB-ROLE-HARDENING-discovery.md.
--
-- Run as the existing superuser (whatever it's actually named — 'postgres'
-- in dev, 'aaramva_prod' in this project's own production cluster; never
-- assume the name), connected to the TARGET database (not the cluster's
-- default database — schema/table ownership is per-database). Idempotent-ish:
-- CREATE ROLE will error if aaramva_app already exists cluster-wide (expected
-- on a second database in the same cluster — see the scratch-backup-stage
-- note below) and can be skipped in that case; everything else is safe to
-- re-run.
--
-- Required -v variables: aaramva_app_password, target_db, old_owner_name
-- (the role that owns everything today — see §3 below for why this must
-- never be hardcoded).
--
-- Proven approach, not the naive one: a blanket `REASSIGN OWNED BY postgres
-- TO aaramva_app` fails with "cannot reassign ownership of objects owned by
-- role postgres because they are required by the database system" — postgres
-- also owns the pre-installed plpgsql extension (both as a LANGUAGE and,
-- separately, as an EXTENSION — Postgres has no `ALTER EXTENSION ... OWNER
-- TO` command at all, so REASSIGN OWNED can never get past it). This script
-- surgically reassigns only the app's own objects instead of the blunt
-- database-wide command, and never touches plpgsql.

-- 1. Role + database-level grants (skip if the role already exists —
--    roles are cluster-wide, not per-database; running this script against
--    a second database in the same cluster as an earlier run is expected to
--    skip this, not error).
--    NOTE: this must be plain top-level SQL, not a DO $$ ... $$ block —
--    psql's `:'var'` substitution does NOT reach inside dollar-quoted
--    bodies (dollar-quoting is deliberately opaque to it), so a CREATE ROLE
--    written inside a DO block here would silently fail to parse the very
--    first time this script ever runs against a truly fresh cluster. Using
--    \gexec instead keeps the substitution at the top level, where it works.
SELECT 'CREATE ROLE aaramva_app WITH LOGIN PASSWORD ' || quote_literal(:'aaramva_app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aaramva_app') \gexec

GRANT CONNECT ON DATABASE :"target_db" TO aaramva_app;
GRANT CREATE ON DATABASE :"target_db" TO aaramva_app;
GRANT USAGE, CREATE ON SCHEMA public TO aaramva_app;

-- 2. Surgical ownership reassignment — schemas, tables, sequences, the one
--    custom enum type, and the ledger-immutability trigger functions.
--    Deliberately does NOT touch plpgsql or the public schema's own
--    container (left as the PG15+ pg_database_owner pseudo-role default;
--    the GRANT above already gives aaramva_app everything it needs there).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%' LOOP
    EXECUTE format('ALTER SCHEMA %I OWNER TO aaramva_app', r.nspname);
  END LOOP;

  FOR r IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname LIKE 'tenant_%' OR schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I.%I OWNER TO aaramva_app', r.schemaname, r.tablename);
  END LOOP;

  FOR r IN SELECT schemaname, sequencename FROM pg_sequences WHERE schemaname LIKE 'tenant_%' OR schemaname = 'public' LOOP
    EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO aaramva_app', r.schemaname, r.sequencename);
  END LOOP;

  FOR r IN SELECT n.nspname, t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'public' AND t.typtype = 'e' LOOP
    EXECUTE format('ALTER TYPE %I.%I OWNER TO aaramva_app', r.nspname, r.typname);
  END LOOP;

  FOR r IN SELECT n.nspname, p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname LIKE 'tenant_%' OR n.nspname = 'public' LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO aaramva_app', r.sig);
  END LOOP;
END $$;

-- 3. Verification — must return zero rows. Pass -v old_owner_name=<the
--    role that owned everything BEFORE this script ran>. Do not assume
--    'postgres' — this project's own production cluster was bootstrapped
--    with POSTGRES_USER=aaramva_prod, and 'postgres' does not exist there
--    at all. A hardcoded 'postgres' here was a real bug, caught before it
--    ran against production: it would have reported false success on any
--    cluster where the pre-existing superuser has a different name, since
--    nothing would ever match a hardcoded 'postgres' check trivially —
--    the check would pass even if the reassignment above had silently
--    failed entirely.
SELECT 'table' AS kind, schemaname, tablename AS name FROM pg_tables WHERE (schemaname LIKE 'tenant_%' OR schemaname='public') AND tableowner=:'old_owner_name'
UNION ALL
SELECT 'sequence', schemaname, sequencename FROM pg_sequences WHERE (schemaname LIKE 'tenant_%' OR schemaname='public') AND sequenceowner=:'old_owner_name'
UNION ALL
SELECT 'type', n.nspname, t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e' AND t.typowner::regrole::text=:'old_owner_name'
UNION ALL
SELECT 'function', n.nspname, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname LIKE 'tenant_%' OR n.nspname='public') AND p.proowner::regrole::text=:'old_owner_name';
