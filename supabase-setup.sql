update public.beallitasok
set
  site_name = 'FuvarVelünk',
  company_name = 'FuvarVelünk',
  contact_email = 'cegweb26@gmail.com',
  admin_email = 'cegweb26@gmail.com'
where id = 1;

alter table if exists public.fuvarok add column if not exists auto_tipus text;
alter table if exists public.fuvarok add column if not exists bankszamla text;
alter table if exists public.fuvarok add column if not exists statusz text default 'Függőben';
alter table if exists public.fuvarok add column if not exists auto_helyek integer;
alter table if exists public.fuvarok add column if not exists osszes_hely integer;
alter table if exists public.fuvarok add column if not exists fizetesi_modok text[];
alter table if exists public.fuvarok add column if not exists sofor_ertekeles numeric default 5;
