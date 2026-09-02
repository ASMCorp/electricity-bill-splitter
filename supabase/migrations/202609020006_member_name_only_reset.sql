-- Reset roster and monthly records after simplifying member identity to one public name.
-- Tariff versions are intentionally preserved.

begin;

-- Remove old snapshots from both the source table and the audit history. The
-- delete triggers below may add fresh audit rows, so the second cleanup is
-- intentional.
delete from public.audit_logs
where table_name in ('monthly_bills', 'members');

delete from public.monthly_bills;

delete from public.audit_logs
where table_name in ('monthly_bills', 'members');

-- Rebuild the roster so a manually altered table cannot leave stale columns,
-- policies, triggers, or constraints behind.
drop trigger if exists monthly_bills_00_validate_roster on public.monthly_bills;
drop function if exists public.validate_monthly_bill_roster();
drop table if exists public.members;

create table public.members (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
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
        or jsonb_typeof(person -> 'display_name') <> 'string'
    ) then
    raise exception 'People snapshot must identify every roster member by name.';
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

-- The monthly-bill validator is recreated because its snapshot contract no
-- longer includes a second identity field.
create or replace function public.validate_monthly_bill()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  tolerance constant numeric := 0.0001;
  expected_tariff_id uuid;
  stored_slabs jsonb;
  slab jsonb;
  person jsonb;
  slab_index integer;
  remaining_bill numeric := new.total_bill;
  slab_units numeric;
  slab_rate numeric;
  used numeric;
  used_units numeric[] := array[]::numeric[];
  slab_rates numeric[] := array[]::numeric[];
  expected_total_units numeric := 0;
  expected_ac_units numeric := 0;
  remaining_ac_units numeric;
  expected_ac_cost numeric := 0;
  expected_ac_rate numeric := 0;
  expected_shared_per_person numeric;
  people_count integer;
  reconciled_total numeric := 0;
  reconciled_ac_amount numeric := 0;
  reconciled_shared_amount numeric := 0;
begin
  perform pg_advisory_xact_lock(1163284052);

  select id, slabs into expected_tariff_id, stored_slabs
  from public.tariff_versions
  where effective_from <= make_date(new.bill_year, new.bill_month, 1)
  order by effective_from desc
  limit 1;

  if expected_tariff_id is null or new.tariff_version_id <> expected_tariff_id then
    raise exception 'Monthly bills must use the latest tariff effective on or before the first day of the bill month.';
  end if;

  if stored_slabs <> new.tariff_snapshot then
    raise exception 'Tariff snapshot must exactly match the selected immutable tariff version.';
  end if;

  if jsonb_typeof(new.calculation_snapshot) <> 'object'
    or not (new.calculation_snapshot ?& array['total_units', 'ac_units', 'ac_cost', 'shared_per_person', 'capped'])
    or jsonb_typeof(new.calculation_snapshot -> 'total_units') <> 'number'
    or jsonb_typeof(new.calculation_snapshot -> 'ac_units') <> 'number'
    or jsonb_typeof(new.calculation_snapshot -> 'ac_cost') <> 'number'
    or jsonb_typeof(new.calculation_snapshot -> 'shared_per_person') <> 'number'
    or jsonb_typeof(new.calculation_snapshot -> 'capped') <> 'boolean' then
    raise exception 'Calculation snapshot is incomplete or invalid.';
  end if;

  if jsonb_typeof(new.people_snapshot) <> 'array'
    or jsonb_array_length(new.people_snapshot) = 0 then
    raise exception 'At least one calculated person is required.';
  end if;

  people_count := jsonb_array_length(new.people_snapshot);
  for person in select * from jsonb_array_elements(new.people_snapshot)
  loop
    if jsonb_typeof(person) <> 'object'
      or jsonb_typeof(person -> 'member_id') <> 'string'
      or jsonb_typeof(person -> 'display_name') <> 'string'
      or nullif(btrim(person ->> 'display_name'), '') is null
      or not (person ?& array['position', 'ac_units', 'ac_amount', 'shared_amount', 'total_amount'])
      or jsonb_typeof(person -> 'position') <> 'number'
      or jsonb_typeof(person -> 'ac_units') <> 'number'
      or jsonb_typeof(person -> 'ac_amount') <> 'number'
      or jsonb_typeof(person -> 'shared_amount') <> 'number'
      or jsonb_typeof(person -> 'total_amount') <> 'number'
      or (person ->> 'position')::numeric < 0
      or (person ->> 'position')::numeric > 2147483647
      or (person ->> 'position')::numeric <> trunc((person ->> 'position')::numeric)
      or (person ->> 'ac_units')::numeric < 0
      or (person ->> 'ac_amount')::numeric < 0
      or (person ->> 'shared_amount')::numeric < 0
      or (person ->> 'total_amount')::numeric < 0 then
      raise exception 'People snapshot contains an invalid row.';
    end if;
    expected_ac_units := expected_ac_units + (person ->> 'ac_units')::numeric;
  end loop;

  for slab_index in 0..jsonb_array_length(stored_slabs) - 1
  loop
    slab := stored_slabs -> slab_index;
    slab_rate := (slab ->> 'rate')::numeric;
    slab_units := case when jsonb_typeof(slab -> 'units') = 'null'
      then null else (slab ->> 'units')::numeric end;
    used := case when slab_units is null
      then remaining_bill / slab_rate
      else least(slab_units, remaining_bill / slab_rate) end;
    used := greatest(used, 0);
    used_units := array_append(used_units, used);
    slab_rates := array_append(slab_rates, slab_rate);
    expected_total_units := expected_total_units + used;
    remaining_bill := greatest(remaining_bill - used * slab_rate, 0);
  end loop;

  if remaining_bill > tolerance then
    raise exception 'Tariff snapshot cannot price the complete bill.';
  end if;
  if expected_ac_units > expected_total_units + tolerance then
    raise exception 'People AC units exceed the bill units.';
  end if;

  remaining_ac_units := expected_ac_units;
  slab_index := array_length(used_units, 1);
  while slab_index >= 1 and remaining_ac_units > tolerance
  loop
    used := least(remaining_ac_units, used_units[slab_index]);
    expected_ac_cost := expected_ac_cost + used * slab_rates[slab_index];
    remaining_ac_units := remaining_ac_units - used;
    slab_index := slab_index - 1;
  end loop;

  if expected_ac_units > tolerance then
    expected_ac_rate := expected_ac_cost / expected_ac_units;
  end if;
  expected_shared_per_person := (new.total_bill - expected_ac_cost) / people_count;

  if abs((new.calculation_snapshot ->> 'total_units')::numeric - expected_total_units) > tolerance
    or abs((new.calculation_snapshot ->> 'ac_units')::numeric - expected_ac_units) > tolerance
    or abs((new.calculation_snapshot ->> 'ac_cost')::numeric - expected_ac_cost) > tolerance
    or abs((new.calculation_snapshot ->> 'shared_per_person')::numeric - expected_shared_per_person) > tolerance
    or ((new.calculation_snapshot ->> 'capped')::boolean
      and abs(expected_ac_units - expected_total_units) > tolerance) then
    raise exception 'Calculation snapshot does not match the tariff algorithm.';
  end if;

  for person in select * from jsonb_array_elements(new.people_snapshot)
  loop
    if abs((person ->> 'ac_amount')::numeric
        - (person ->> 'ac_units')::numeric * expected_ac_rate) > tolerance
      or abs((person ->> 'shared_amount')::numeric - expected_shared_per_person) > tolerance
      or abs((person ->> 'total_amount')::numeric
        - (person ->> 'ac_amount')::numeric
        - (person ->> 'shared_amount')::numeric) > tolerance then
      raise exception 'People snapshot does not match the tariff calculation.';
    end if;
    reconciled_ac_amount := reconciled_ac_amount + (person ->> 'ac_amount')::numeric;
    reconciled_shared_amount := reconciled_shared_amount + (person ->> 'shared_amount')::numeric;
    reconciled_total := reconciled_total + (person ->> 'total_amount')::numeric;
  end loop;

  if abs(reconciled_ac_amount - expected_ac_cost) > tolerance
    or abs(reconciled_shared_amount - (new.total_bill - expected_ac_cost)) > tolerance
    or abs(reconciled_total - new.total_bill) > tolerance
    or abs(reconciled_total - reconciled_ac_amount - reconciled_shared_amount) > tolerance then
    raise exception 'Calculated person totals must reconcile to the monthly bill.';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.published_at is not null then
      raise exception 'New monthly bills must start as drafts.';
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.id := old.id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;

    if old.status = 'published' then
      if new.status = 'published' then
        if (new.bill_year, new.bill_month, new.total_bill, new.tariff_version_id,
            new.tariff_snapshot, new.calculation_snapshot, new.people_snapshot)
          is distinct from
           (old.bill_year, old.bill_month, old.total_bill, old.tariff_version_id,
            old.tariff_snapshot, old.calculation_snapshot, old.people_snapshot) then
          raise exception 'Published bills are immutable. Reopen the bill before editing.';
        end if;
        new.published_at := old.published_at;
      elsif new.status = 'draft' then
        if (new.bill_year, new.bill_month, new.total_bill, new.tariff_version_id,
            new.tariff_snapshot, new.calculation_snapshot, new.people_snapshot)
          is distinct from
           (old.bill_year, old.bill_month, old.total_bill, old.tariff_version_id,
            old.tariff_snapshot, old.calculation_snapshot, old.people_snapshot) then
          raise exception 'Reopening and editing must be separate operations.';
        end if;
        new.published_at := null;
      end if;
    elsif old.status = 'draft' and new.status = 'published' then
      new.published_at := now();
    else
      new.published_at := null;
    end if;
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
exception
  when invalid_text_representation or numeric_value_out_of_range or division_by_zero then
    raise exception 'Monthly bill snapshots contain invalid numeric values.';
end;
$$;

create or replace view public.published_monthly_bills
with (security_barrier = true)
as
select
  b.id,
  b.bill_year,
  b.bill_month,
  b.total_bill,
  b.tariff_snapshot,
  b.calculation_snapshot,
  coalesce(public_people.people_snapshot, '[]'::jsonb) as people_snapshot,
  b.published_at
from public.monthly_bills b
cross join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'position', person -> 'position',
      'display_name', person -> 'display_name',
      'color', person -> 'color',
      'ac_units', person -> 'ac_units',
      'ac_amount', person -> 'ac_amount',
      'shared_amount', person -> 'shared_amount',
      'total_amount', person -> 'total_amount'
    ) order by (person ->> 'position')::integer
  ) as people_snapshot
  from jsonb_array_elements(b.people_snapshot) person
) public_people
where b.status = 'published';

grant select on public.published_monthly_bills to anon, authenticated;
revoke execute on function public.validate_monthly_bill() from public;

delete from public.audit_logs
where table_name in ('monthly_bills', 'members');

commit;
