-- FuvarVelunk foglalásos védelem
-- Cél:
-- 1) Ha egy fuvarhoz már van foglalás, ne lehessen törölni.
-- 2) Ha egy fuvarhoz már van foglalás, csak az admin tudja módosítani.
-- 3) Admin továbbra is mindent kezelhessen.

alter table public.fuvarok enable row level security;

-- TÖRLÉS: csak akkor törölhető, ha nincs hozzá foglalás, vagy admin az illető

drop policy if exists "fuvarok_owner_or_admin_delete" on public.fuvarok;

create policy "fuvarok_owner_or_admin_delete"
on public.fuvarok
for delete
to authenticated
using (
  lower(coalesce(auth.email(), '')) = 'atika.76@windowslive.com'
  or (
    auth.uid() = user_id
    and not exists (
      select 1
      from public.foglalasok f
      where f.fuvar_id = fuvarok.id
    )
  )
);

-- MÓDOSÍTÁS: admin mindig tudja,
-- tulajdonos csak akkor, ha még nincs foglalás

drop policy if exists "fuvarok_owner_or_admin_update" on public.fuvarok;

create policy "fuvarok_owner_or_admin_update"
on public.fuvarok
for update
to authenticated
using (
  lower(coalesce(auth.email(), '')) = 'atika.76@windowslive.com'
  or (
    auth.uid() = user_id
    and not exists (
      select 1
      from public.foglalasok f
      where f.fuvar_id = fuvarok.id
    )
  )
)
with check (
  lower(coalesce(auth.email(), '')) = 'atika.76@windowslive.com'
  or (
    auth.uid() = user_id
    and not exists (
      select 1
      from public.foglalasok f
      where f.fuvar_id = fuvarok.id
    )
  )
);
