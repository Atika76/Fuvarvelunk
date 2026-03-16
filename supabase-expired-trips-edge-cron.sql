-- =========================================
-- FUVARVELÜNK - LEJÁRT FUVAROK AUTOMATIKUS TÖRLÉSE
-- Supabase Edge Function + pg_cron + pg_net + Vault
--
-- 1) Előbb deployold az Edge Functiont: cleanup-expired-trips
-- 2) A dashboardban állíts be egy CRON_SECRET secretet ugyanazzal az értékkel,
--    amit lent a vault.create_secret résznél használsz.
-- 3) A YOUR_PROJECT_URL, YOUR_ANON_KEY, YOUR_CRON_SECRET részeket cseréld ki.
-- 4) Futtasd le ezt a fájlt a SQL Editorban.
-- =========================================

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists vault;

-- Tárold biztonságosan a szükséges adatokat a Vaultban.
-- Ha már léteznek, előbb töröld őket a Vault UI-ban vagy adj nekik új nevet.
select vault.create_secret('YOUR_PROJECT_URL', 'fv_project_url');
select vault.create_secret('YOUR_ANON_KEY', 'fv_anon_key');
select vault.create_secret('YOUR_CRON_SECRET', 'fv_cron_secret');

-- Régi job törlése, ha már volt.
select cron.unschedule('fuvarvelunk-expired-trip-cleanup')
where exists (
  select 1 from cron.job where jobname = 'fuvarvelunk-expired-trip-cleanup'
);

-- Minden nap 02:15 UTC-kor fut.
select cron.schedule(
  'fuvarvelunk-expired-trip-cleanup',
  '15 2 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'fv_project_url') || '/functions/v1/cleanup-expired-trips',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fv_anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fv_cron_secret')
    ),
    body := jsonb_build_object('graceDays', 3),
    timeout_milliseconds := 10000
  ) as request_id;
  $$
);

-- Ellenőrzés:
-- select * from cron.job where jobname = 'fuvarvelunk-expired-trip-cleanup';
-- select * from cron.job_run_details order by start_time desc limit 20;
