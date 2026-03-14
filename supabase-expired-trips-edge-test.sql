-- KÉZI PRÓBAFUTTATÁS
-- Ezzel rögtön kipróbálhatod az Edge Functiont SQL-ből.
select net.http_post(
  url := 'YOUR_PROJECT_URL/functions/v1/cleanup-expired-trips',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || 'YOUR_ANON_KEY',
    'x-cron-secret', 'YOUR_CRON_SECRET'
  ),
  body := jsonb_build_object('graceDays', 3, 'dryRun', true),
  timeout_milliseconds := 10000
) as request_id;
