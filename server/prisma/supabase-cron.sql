-- Supabase pg_cron: triggers plan accrual from the database side.
--
-- The API already runs accrual hourly in-process and once at startup. This
-- adds an outside trigger that wakes an instance a host has idled, such as
-- Render's free tier, which never runs its in-process schedule while asleep.
-- Accrual pays whatever is owed, however late it runs, so a late or failed
-- request only delays a payout and never loses one.
--
-- One-time setup. Run it in the Supabase SQL editor once the API is deployed
-- and CRON_SECRET is set on it. Replace the two placeholders first. The real
-- values go into Vault, so neither the URL nor the secret appears in
-- cron.job or in this repository.

-- 1. Extensions. You can also enable these under Database -> Extensions.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 2. Secrets. Run once. To change one later, use vault.update_secret(id, ...).
select vault.create_secret(
  'https://YOUR-API-HOST',          -- the API's public origin, no trailing slash
  'bowline_api_url',
  'Bowline API origin, called by the accrual cron job'
);
select vault.create_secret(
  'PASTE-THE-CRON_SECRET-HERE',     -- the exact CRON_SECRET value set on the API
  'bowline_cron_secret',
  'Bearer secret for POST /api/v1/internal/jobs/*'
);

-- 3. The schedule, at five past every hour. Scheduling under the same name
--    again replaces the job, so this step is safe to re-run.
select cron.schedule(
  'bowline-accrue-plan-returns',
  '5 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets
            where name = 'bowline_api_url')
           || '/api/v1/internal/jobs/accrue-plan-returns',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                     where name = 'bowline_cron_secret')
    ),
    body := '{}'::jsonb,
    -- A sleeping free-tier instance can take about a minute to wake.
    timeout_milliseconds := 120000
  );
  $job$
);

-- Checking it works:
--   select jobid, schedule, active from cron.job;
--   select status, return_message, start_time from cron.job_run_details
--     order by start_time desc limit 5;
--   select status_code, content, created from net._http_response
--     order by created desc limit 5;   -- expect 200 and {"success":true,...}
--
-- Removing it:
--   select cron.unschedule('bowline-accrue-plan-returns');
