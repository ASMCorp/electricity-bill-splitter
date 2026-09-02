-- Repair an older members table created before public aliases were introduced.
-- Existing members receive a neutral alias rather than their private name.

alter table public.members
  add column if not exists public_alias text;

update public.members
set public_alias = 'Member ' || right(id::text, 6)
where nullif(btrim(public_alias), '') is null;

alter table public.members
  alter column public_alias set not null;

alter table public.members
  drop constraint if exists members_public_alias_nonempty;

alter table public.members
  add constraint members_public_alias_nonempty
  check (length(btrim(public_alias)) between 1 and 120);

create or replace function public.prepare_member_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(1163284053);
  new.display_name := btrim(new.display_name);
  new.public_alias := btrim(new.public_alias);
  new.updated_by := auth.uid();
  new.updated_at := now();

  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  return new;
end;
$$;

drop trigger if exists members_prepare_write on public.members;

create trigger members_prepare_write
before insert or update on public.members
for each row execute function public.prepare_member_write();

revoke execute on function public.prepare_member_write() from public;
