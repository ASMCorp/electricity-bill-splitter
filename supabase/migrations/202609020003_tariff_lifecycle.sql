-- Allow administrators to correct setup mistakes by deleting only
-- future tariff versions that have never been used by a monthly bill.

create or replace function public.protect_tariff_versions()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Tariff versions cannot be updated; create a new effective-dated version instead.';
  end if;

  if tg_op = 'DELETE' then
    if old.effective_from <= current_date then
      raise exception 'Current and past tariff versions cannot be deleted.';
    end if;

    if exists (
      select 1
      from public.monthly_bills
      where tariff_version_id = old.id
    ) then
      raise exception 'Tariff versions used by monthly bills cannot be deleted.';
    end if;

    return old;
  end if;

  return new;
end;
$$;

create policy tariffs_admin_delete
on public.tariff_versions for delete
to authenticated
using (public.is_admin());

grant delete on public.tariff_versions to authenticated;
