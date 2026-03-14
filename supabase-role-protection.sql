-- Csak tulajdonos vagy admin módosíthat / törölhet fuvarokat
-- Admin e-mail: atika.76@windowslive.com

drop policy if exists "fuvarok_authenticated_update" on public.fuvarok;
drop policy if exists "fuvarok_owner_or_admin_update" on public.fuvarok;
create policy "fuvarok_owner_or_admin_update"
on public.fuvarok
for update
to authenticated
using (
  auth.uid() = user_id
  or lower(coalesce(auth.email(), '')) = 'atika.76@windowslive.com'
)
with check (
  auth.uid() = user_id
  or lower(coalesce(auth.email(), '')) = 'atika.76@windowslive.com'
);

drop policy if exists "fuvarok_authenticated_delete" on public.fuvarok;
drop policy if exists "fuvarok_owner_or_admin_delete" on public.fuvarok;
create policy "fuvarok_owner_or_admin_delete"
on public.fuvarok
for delete
to authenticated
using (
  auth.uid() = user_id
  or lower(coalesce(auth.email(), '')) = 'atika.76@windowslive.com'
);
