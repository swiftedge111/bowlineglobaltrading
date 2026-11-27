-- Supabase lockdown: keeps every table in `public` away from Supabase's Data API.
--
-- Supabase serves the `public` schema over its REST API to the `anon` and
-- `authenticated` roles. This backend never uses that API. All access goes
-- through Express and Prisma. So the script:
--   1. enables row-level security on every public table, with no policies
--   2. revokes every grant those two roles hold on tables and sequences
--   3. revokes them by default on tables later migrations create
--
-- The backend connects as the role that runs the migrations and owns the
-- tables. Owners bypass RLS, so the API is unaffected.
--
-- Safe to run more than once. It also runs on plain PostgreSQL, where the
-- Supabase roles don't exist and steps 2 and 3 are skipped.
--
-- Run after `npm run prisma:deploy`:  npm run db:lockdown

DO $$
DECLARE
  t record;
  api_roles_exist boolean :=
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;

  IF api_roles_exist THEN
    REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated',
      current_user);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated',
      current_user);
  END IF;
END $$;

-- To verify, run this in the Supabase SQL editor. Every row should show
-- rls = true and anon_can_select = false.
--
--   SELECT c.relname AS table, c.relrowsecurity AS rls,
--          has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_select
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r'
--   ORDER BY 1;
