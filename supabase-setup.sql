-- Utazz Velem – Supabase beállító SQL
create table if not exists public.beallitasok (
  id int primary key default 1,
  site_name text default 'Utazz Velem',
  company_name text default 'Utazz Velem',
  description text default 'Gyors és biztonságos fuvarmegosztó felület utasoknak és sofőröknek.',
  contact_email text default 'info@utazzvelem.hu',
  contact_phone text default '+36 30 123 4567',
  city text default 'Budapest',
  admin_email text default 'cegweb26@gmail.com',
  updated_at timestamptz default now()
);
insert into public.beallitasok (id) values (1) on conflict (id) do nothing;

alter table public.fuvarok add column if not exists user_id uuid;
alter table public.fuvarok add column if not exists osszes_hely bigint default 4;
alter table public.fuvarok add column if not exists auto_tipus text;
alter table public.fuvarok add column if not exists fizetesi_modok text[] default array['barion','cash'];

create table if not exists public.foglalasok (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  trip_id bigint not null references public.fuvarok(id) on delete cascade,
  user_id uuid,
  nev text not null,
  email text not null,
  telefon text,
  foglalt_helyek bigint default 1,
  fizetesi_mod text default 'cash',
  fizetesi_allapot text default 'Függőben',
  foglalasi_allapot text default 'Új',
  megjegyzes text
);

create index if not exists idx_foglalasok_trip_id on public.foglalasok(trip_id);
create index if not exists idx_fuvarok_statusz on public.fuvarok(statusz);
