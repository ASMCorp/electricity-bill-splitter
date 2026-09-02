-- Persistent admin-managed member roster. Removing a member is a soft deactivation
-- so historical monthly-bill snapshots remain unchanged.

create table public.members (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  public_alias text not null check (length(btrim(public_alias)) between 1 and 120),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index members_active_created_idx
  on public.members (is_active desc, created_at asc);

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

create trigger members_prepare_write
before insert or update on public.members
for each row execute function public.prepare_member_write();

create trigger members_audit
after insert or update or delete on public.members
for each row execute function public.write_audit_log();

alter table public.members enable row level security;

create policy members_admin_read
on public.members for select
to authenticated
using (public.is_admin());

create policy members_admin_insert
on public.members for insert
to authenticated
with check (public.is_admin() and created_by = auth.uid());

create policy members_admin_update
on public.members for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public.members from anon, authenticated;
grant select, insert, update on public.members to authenticated;

revoke execute on function public.prepare_member_write() from public;

-- Serialize roster mutations with monthly-bill validation. Published history
-- can be reopened, but a draft cannot be saved or published again until its
-- private names and public aliases match the current active roster.
create or replace function public.validate_monthly_bill_roster()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  active_count integer;
  matching_count integer;
  snapshot_count integer;
begin
  if tg_op = 'UPDATE' and not (
    old.status = 'draft'
    and (
      new.status = 'published'
      or new.people_snapshot is distinct from old.people_snapshot
    )
  ) then
    return new;
  end if;

  perform pg_advisory_xact_lock(1163284053);

  if jsonb_typeof(new.people_snapshot) <> 'array'
    or exists (
      select 1
      from jsonb_array_elements(new.people_snapshot) as person
      where jsonb_typeof(person -> 'member_id') <> 'string'
    ) then
    raise exception 'People snapshot must identify every roster member.';
  end if;

  snapshot_count := jsonb_array_length(new.people_snapshot);

  select count(*) into active_count
  from public.members
  where is_active;

  select count(*) into matching_count
  from public.members as m
  where m.is_active
    and exists (
      select 1
      from jsonb_array_elements(new.people_snapshot) as person
      where m.id::text = person ->> 'member_id'
        and m.display_name = person ->> 'display_name'
        and m.public_alias = person ->> 'public_alias'
    );

  if snapshot_count <> active_count or matching_count <> active_count then
    raise exception 'People snapshot must exactly match the current active roster.';
  end if;

  return new;
end;
$$;

create trigger monthly_bills_00_validate_roster
before insert or update on public.monthly_bills
for each row execute function public.validate_monthly_bill_roster();

revoke execute on function public.validate_monthly_bill_roster() from public;
