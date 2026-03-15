create table if not exists public.email_naplo (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  tipus text,
  cel_email text,
  statusz text,
  sikeres boolean default false,
  targy text,
  payload jsonb default '{}'::jsonb
);
