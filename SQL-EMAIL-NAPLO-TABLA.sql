create table if not exists public.email_naplo (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  tipus text,
  cel_email text,
  targy text,
  sikeres boolean default false,
  statusz text,
  payload jsonb
);
