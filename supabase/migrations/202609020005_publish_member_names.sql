-- Published records now show member names directly. `public_alias` remains in
-- private snapshots only for compatibility with historical validation.

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
    );

  if snapshot_count <> active_count or matching_count <> active_count then
    raise exception 'People snapshot must exactly match the current active roster.';
  end if;

  return new;
end;
$$;

revoke execute on function public.validate_monthly_bill_roster() from public;
