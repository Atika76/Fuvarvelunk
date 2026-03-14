-- 10 percenként futtatja a cleanup-expired-trips edge functiont
-- ami közben a 2 órán belül induló fuvarokra emlékeztetőt is küld

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.unschedule('fuvarvelunk_cleanup_and_reminder');

select cron.schedule(
  'fuvarvelunk_cleanup_and_reminder',
  '*/10 * * * *',
  $$
  select
    net.http_post(
      url := 'https://qkppqjcazakocxgxtlzc.supabase.co/functions/v1/cleanup-expired-trips',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', 'IRD_BE_IDE_A_CRON_SECRETET'
      ),
      body := jsonb_build_object(
        'graceDays', 3,
        'reminderWindowMinutes', 120,
        'dryRun', false
      )
    );
  $$
);
