-- FuvarVelünk teljesebb Supabase beállítások
-- Futtasd a teljes fájlt egyszer a SQL Editorban.

update public.beallitasok
set
  site_name = 'FuvarVelünk',
  company_name = 'FuvarVelünk',
  contact_email = 'cegweb26@gmail.com',
  admin_email = 'cegweb26@gmail.com'
where id = 1;

insert into public.beallitasok (site_name, company_name, contact_email, admin_email)
select 'FuvarVelünk', 'FuvarVelünk', 'cegweb26@gmail.com', 'cegweb26@gmail.com'
where not exists (select 1 from public.beallitasok);

alter table if exists public.fuvarok add column if not exists user_id uuid;
alter table if exists public.fuvarok add column if not exists approved boolean default false;
alter table if exists public.fuvarok add column if not exists created_at timestamptz default now();
alter table if exists public.fuvarok add column if not exists updated_at timestamptz default now();
alter table if exists public.fuvarok add column if not exists profil_kep_url text;
alter table if exists public.fuvarok add column if not exists auto_kepek jsonb default '[]'::jsonb;
alter table if exists public.fuvarok add column if not exists sofor_ertekeles numeric default 0;
alter table if exists public.fuvarok add column if not exists ertekeles_db integer default 0;

create index if not exists idx_fuvarok_approved_created_at
on public.fuvarok (approved, created_at desc);

alter table if exists public.fuvarok enable row level security;

-- régi, kusza policyk törlése
 drop policy if exists "Fuvar beszúrás" on public.fuvarok;
 drop policy if exists "Fuvar beszúrás engedélyezése" on public.fuvarok;
 drop policy if exists "Fuvar módosítás" on public.fuvarok;
 drop policy if exists "Fuvar módosítás adminnak" on public.fuvarok;
 drop policy if exists "Fuvar olvasás" on public.fuvarok;
 drop policy if exists "Fuvar olvasás engedélyezése" on public.fuvarok;
 drop policy if exists "Fuvar törlés" on public.fuvarok;
 drop policy if exists "Fuvar törlés engedélyezése" on public.fuvarok;
 drop policy if exists "Fuvarok olvasása" on public.fuvarok;
 drop policy if exists "Fuvarok public read" on public.fuvarok;
 drop policy if exists "Insert fuvar authenticated" on public.fuvarok;
 drop policy if exists "Select fuvar authenticated" on public.fuvarok;
 drop policy if exists "fuvar_insert" on public.fuvarok;
 drop policy if exists "fuvar_select" on public.fuvarok;
 drop policy if exists "allow_authenticated_insert" on public.fuvarok;
 drop policy if exists "allow_public_insert" on public.fuvarok;
 drop policy if exists "fuvarok_public_select" on public.fuvarok;
 drop policy if exists "fuvarok_authenticated_insert" on public.fuvarok;
 drop policy if exists "fuvarok_authenticated_update" on public.fuvarok;
 drop policy if exists "fuvarok_authenticated_delete" on public.fuvarok;

create policy "fuvarok_public_select"
on public.fuvarok
for select
to anon, authenticated
using (true);

create policy "fuvarok_authenticated_insert"
on public.fuvarok
for insert
to authenticated
with check (auth.uid() is not null);

create policy "fuvarok_owner_or_admin_update"
on public.fuvarok
for update
to authenticated
using (
  auth.uid() = user_id
  or lower(coalesce(auth.email(), '')) = 'cegweb26@gmail.com'
)
with check (
  auth.uid() = user_id
  or lower(coalesce(auth.email(), '')) = 'cegweb26@gmail.com'
);

create policy "fuvarok_owner_or_admin_delete"
on public.fuvarok
for delete
to authenticated
using (
  auth.uid() = user_id
  or lower(coalesce(auth.email(), '')) = 'cegweb26@gmail.com'
);

-- foglalások
alter table if exists public.foglalasok enable row level security;
drop policy if exists "foglalasok_select" on public.foglalasok;
drop policy if exists "foglalasok_insert" on public.foglalasok;
drop policy if exists "foglalasok_update" on public.foglalasok;
drop policy if exists "foglalasok_delete" on public.foglalasok;

create policy "foglalasok_select"
on public.foglalasok
for select
to authenticated
using (true);

create policy "foglalasok_insert"
on public.foglalasok
for insert
to authenticated
with check (auth.uid() is not null);

create policy "foglalasok_update"
on public.foglalasok
for update
to authenticated
using (true)
with check (true);

create policy "foglalasok_delete"
on public.foglalasok
for delete
to authenticated
using (true);

-- értékelések
alter table if exists public.ertekelesek enable row level security;
drop policy if exists "ertekeles_insert" on public.ertekelesek;
drop policy if exists "Ertekeles beszuras" on public.ertekelesek;
drop policy if exists "Ertekeles beszúrás" on public.ertekelesek;
drop policy if exists "allow_ertekeles_insert" on public.ertekelesek;
drop policy if exists "allow_ertekeles_select" on public.ertekelesek;

create policy "allow_ertekeles_insert"
on public.ertekelesek
for insert
to authenticated
with check (auth.uid() is not null);

create policy "allow_ertekeles_select"
on public.ertekelesek
for select
to anon, authenticated
using (true);

-- E-mail napló
create table if not exists public.email_naplo (
  id bigserial primary key,
  tipus text not null,
  cel_email text,
  statusz text not null default 'fuggoben',
  sikeres boolean default false,
  targy text,
  payload jsonb,
  created_at timestamptz default now()
);

alter table public.email_naplo enable row level security;
drop policy if exists "Email naplo olvasas" on public.email_naplo;
drop policy if exists "Email naplo iras" on public.email_naplo;
create policy "Email naplo olvasas" on public.email_naplo for select using (lower(coalesce(auth.email(), '')) = 'cegweb26@gmail.com');
create policy "Email naplo iras" on public.email_naplo for insert with check (auth.uid() is not null);

-- Storage bucketek
insert into storage.buckets (id, name, public)
values ('driver-profile-images', 'driver-profile-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('trip-car-images', 'trip-car-images', true)
on conflict (id) do nothing;

-- driver-profile-images policyk
 drop policy if exists "Profilkep public read" on storage.objects;
 drop policy if exists "Profilkep upload" on storage.objects;
 drop policy if exists "Profilkep update" on storage.objects;
 drop policy if exists "Profilkep torles" on storage.objects;

create policy "Profilkep public read"
on storage.objects
for select
to public
using (bucket_id = 'driver-profile-images');

create policy "Profilkep upload"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'driver-profile-images');

create policy "Profilkep update"
on storage.objects
for update
to authenticated
using (bucket_id = 'driver-profile-images')
with check (bucket_id = 'driver-profile-images');

create policy "Profilkep torles"
on storage.objects
for delete
to authenticated
using (bucket_id = 'driver-profile-images');

-- trip-car-images policyk
 drop policy if exists "Autokep public read" on storage.objects;
 drop policy if exists "Autokep upload" on storage.objects;
 drop policy if exists "Autokep update" on storage.objects;
 drop policy if exists "Autokep torles" on storage.objects;

create policy "Autokep public read"
on storage.objects
for select
to public
using (bucket_id = 'trip-car-images');

create policy "Autokep upload"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'trip-car-images');

create policy "Autokep update"
on storage.objects
for update
to authenticated
using (bucket_id = 'trip-car-images')
with check (bucket_id = 'trip-car-images');

create policy "Autokep torles"
on storage.objects
for delete
to authenticated
using (bucket_id = 'trip-car-images');
