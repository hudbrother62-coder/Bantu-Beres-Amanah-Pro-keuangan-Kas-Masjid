create or replace function public.guard_transaction_mutation()
returns trigger language plpgsql set search_path=public as $$
declare period_status text;
begin
  if tg_op='INSERT' then if current_user<>'postgres' then new.created_by:=auth.uid(); end if; return new; end if;
  if current_user<>'postgres' then
    if old.status in ('pending','posted','rejected','voided') then raise exception 'Only draft transactions can be edited directly'; end if;
    select status into period_status from public.periods where id=old.period_id;
    if period_status='closed' then raise exception 'Closed period transactions cannot be modified'; end if;
    if new.mosque_id<>old.mosque_id or new.created_by<>old.created_by then raise exception 'Transaction ownership fields are immutable'; end if;
  end if;
  return new;
end $$;

drop policy if exists funds_update on public.funds; drop policy if exists funds_write on public.funds;
create policy funds_update on public.funds for update to authenticated using ((select private.is_finance_manager(mosque_id))) with check ((select private.is_finance_manager(mosque_id)));
create policy funds_write on public.funds for insert to authenticated with check ((select private.is_finance_manager(mosque_id)));
drop policy if exists cash_accounts_update on public.cash_accounts; drop policy if exists cash_accounts_write on public.cash_accounts;
create policy cash_accounts_update on public.cash_accounts for update to authenticated using ((select private.is_finance_manager(mosque_id))) with check ((select private.is_finance_manager(mosque_id)));
create policy cash_accounts_write on public.cash_accounts for insert to authenticated with check ((select private.is_finance_manager(mosque_id)));
drop policy if exists categories_update on public.categories; drop policy if exists categories_write on public.categories;
create policy categories_update on public.categories for update to authenticated using ((select private.is_finance_manager(mosque_id))) with check ((select private.is_finance_manager(mosque_id)));
create policy categories_write on public.categories for insert to authenticated with check ((select private.is_finance_manager(mosque_id)));
drop policy if exists opening_allocations_update on public.opening_allocations; drop policy if exists opening_allocations_write on public.opening_allocations;
create policy opening_allocations_update on public.opening_allocations for update to authenticated using ((select private.is_finance_manager(mosque_id))) with check ((select private.is_finance_manager(mosque_id)));
create policy opening_allocations_write on public.opening_allocations for insert to authenticated with check ((select private.is_finance_manager(mosque_id)));
drop policy if exists periods_update on public.periods; drop policy if exists periods_write on public.periods;
create policy periods_update on public.periods for update to authenticated using ((select private.is_finance_manager(mosque_id))) with check ((select private.is_finance_manager(mosque_id)));
create policy periods_write on public.periods for insert to authenticated with check ((select private.is_finance_manager(mosque_id)));
drop policy if exists settings_update on public.settings; drop policy if exists settings_write on public.settings;
create policy settings_update on public.settings for update to authenticated using ((select private.is_finance_manager(mosque_id))) with check ((select private.is_finance_manager(mosque_id)));
create policy settings_write on public.settings for insert to authenticated with check ((select private.is_finance_manager(mosque_id)));
