update public.beallitasok
set
  site_name = 'FuvarVelünk',
  company_name = 'FuvarVelünk',
  contact_email = 'cegweb26@gmail.com',
  admin_email = 'cegweb26@gmail.com'
where id = 1;

alter table if exists public.fuvarok add column if not exists user_id uuid;
alter table if exists public.fuvarok add column if not exists approved boolean default false;
alter table if exists public.fuvarok add column if not exists created_at timestamptz default now();
alter table if exists public.fuvarok add column if not exists updated_at timestamptz default now();

create index if not exists idx_fuvarok_approved_created_at
on public.fuvarok (approved, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='fuvarok' and policyname='Fuvar beszúrás engedélyezése'
  ) then
    create policy "Fuvar beszúrás engedélyezése"
    on public.fuvarok
    for insert
    to authenticated
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='fuvarok' and policyname='Fuvar olvasás engedélyezése'
  ) then
    create policy "Fuvar olvasás engedélyezése"
    on public.fuvarok
    for select
    to anon, authenticated
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='fuvarok' and policyname='Fuvar módosítás adminnak'
  ) then
    create policy "Fuvar módosítás adminnak"
    on public.fuvarok
    for update
    to authenticated
    using (true)
    with check (true);
  end if;
end $$;

alter table if exists public.fuvarok add column if not exists sofor_ertekeles numeric default 4.9;



do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='fuvarok' and policyname='Fuvar törlés engedélyezése'
  ) then
    create policy "Fuvar törlés engedélyezése"
    on public.fuvarok
    for delete
    to authenticated
    using (true);
  end if;
end $$;


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
create policy "Email naplo olvasas" on public.email_naplo for select using (auth.email() = 'cegweb26@gmail.com');
create policy "Email naplo iras" on public.email_naplo for insert with check (auth.uid() is not null);
