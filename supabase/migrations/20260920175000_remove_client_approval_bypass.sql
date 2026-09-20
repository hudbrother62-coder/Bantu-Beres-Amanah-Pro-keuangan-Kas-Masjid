-- Never expose an approval-bypass flag through the public RPC schema.
create or replace function private.finalize_transaction(p_transaction_id uuid)
returns public.transactions language plpgsql security definer set search_path=public,private as $$
declare t public.transactions; begin
  select * into t from public.transactions where id=p_transaction_id for update;
  update public.transactions set status='posted',posted_at=now(),updated_at=now() where id=t.id returning * into t;
  insert into public.audit_logs(mosque_id,actor_id,entity_type,entity_id,action,after_data) values(t.mosque_id,auth.uid(),'transaction',t.id,'posted',to_jsonb(t));
  return t;
end $$;
revoke all on function private.finalize_transaction(uuid) from public,anon,authenticated;

drop function if exists public.post_transaction(uuid,boolean);
create function public.post_transaction(p_transaction_id uuid)
returns transactions language plpgsql security definer set search_path=public as $$
declare t transactions; p periods; alloc numeric; s settings; approver uuid;
begin
  select * into t from transactions where id=p_transaction_id for update;
  if t.id is null or not private.is_finance_manager(t.mosque_id) then raise exception 'Not allowed'; end if;
  if t.status not in ('draft','pending') then raise exception 'Transaction cannot be posted'; end if;
  select * into p from periods where id=t.period_id and mosque_id=t.mosque_id;
  if p.id is null then raise exception 'Transaction period does not belong to mosque'; end if;
  if p.status<>'open' then raise exception 'Period is closed'; end if;
  if t.amount<=0 then raise exception 'Amount must be positive'; end if;
  if t.category_id is not null and not exists(select 1 from categories x where x.id=t.category_id and x.mosque_id=t.mosque_id) then raise exception 'Category does not belong to mosque'; end if;
  if t.fund_id is not null and not exists(select 1 from funds x where x.id=t.fund_id and x.mosque_id=t.mosque_id) then raise exception 'Fund does not belong to mosque'; end if;
  if t.cash_account_id is not null and not exists(select 1 from cash_accounts x where x.id=t.cash_account_id and x.mosque_id=t.mosque_id) then raise exception 'Cash account does not belong to mosque'; end if;
  if t.to_cash_account_id is not null and not exists(select 1 from cash_accounts x where x.id=t.to_cash_account_id and x.mosque_id=t.mosque_id) then raise exception 'Destination cash account does not belong to mosque'; end if;
  if t.donor_id is not null and not exists(select 1 from donors x where x.id=t.donor_id and x.mosque_id=t.mosque_id) then raise exception 'Donor does not belong to mosque'; end if;
  if t.unit_id is not null and not exists(select 1 from units x where x.id=t.unit_id and x.mosque_id=t.mosque_id) then raise exception 'Unit does not belong to mosque'; end if;
  if t.kind='transfer' then
    if t.transfer_fee<>0 then raise exception 'Transfer fee must be recorded as a separate expense'; end if;
    if exists(select 1 from transfer_allocations a join funds f on f.id=a.fund_id where a.transaction_id=t.id and f.mosque_id<>t.mosque_id) then raise exception 'Transfer allocation fund does not belong to mosque'; end if;
    select coalesce(sum(amount),0) into alloc from transfer_allocations where transaction_id=t.id;
    if alloc<>t.amount then raise exception 'Transfer fund allocations must equal transfer amount'; end if;
  end if;
  select * into s from settings where mosque_id=t.mosque_id;
  if coalesce(s.approval_enabled,false) and (s.approval_threshold is null or t.amount>=s.approval_threshold) then
    if t.status='pending' and exists(select 1 from approvals a where a.transaction_id=t.id and a.status='pending') then return t; end if;
    select m.user_id into approver from memberships m where m.mosque_id=t.mosque_id and m.active and m.role in ('owner','treasurer') and (not coalesce(s.four_eyes,false) or m.user_id<>t.created_by) order by case when m.role='owner' then 0 else 1 end,m.created_at limit 1;
    if approver is null then raise exception 'No eligible approver configured'; end if;
    update transactions set status='pending',updated_at=now() where id=t.id returning * into t;
    insert into approvals(mosque_id,transaction_id,approver_id,status) values(t.mosque_id,t.id,approver,'pending') on conflict do nothing;
    insert into audit_logs(mosque_id,actor_id,entity_type,entity_id,action,after_data) values(t.mosque_id,auth.uid(),'transaction',t.id,'submitted_for_approval',to_jsonb(t));
    return t;
  end if;
  return private.finalize_transaction(t.id);
end $$;
revoke all on function public.post_transaction(uuid) from public,anon;
grant execute on function public.post_transaction(uuid) to authenticated;

create or replace function public.decide_approval(p_approval_id uuid,p_decision approval_status,p_note text default null)
returns approvals language plpgsql security definer set search_path=public as $$
declare a approvals; t transactions; s settings;
begin
  if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;
  select * into a from approvals where id=p_approval_id for update;
  if a.id is null or not private.is_finance_manager(a.mosque_id) then raise exception 'Not allowed'; end if;
  if a.status<>'pending' then raise exception 'Approval already decided'; end if;
  select * into t from transactions where id=a.transaction_id for update;
  if t.id is null or t.mosque_id<>a.mosque_id or t.status<>'pending' then raise exception 'Transaction is not pending approval'; end if;
  select * into s from settings where mosque_id=a.mosque_id;
  if coalesce(s.four_eyes,false) and t.created_by=auth.uid() then raise exception 'Creator cannot approve own transaction'; end if;
  if a.approver_id<>auth.uid() and not exists(select 1 from memberships m where m.mosque_id=a.mosque_id and m.user_id=auth.uid() and m.active and m.role='owner') then raise exception 'Not assigned to this approval'; end if;
  update approvals set status=p_decision,note=p_note,decided_at=now(),approver_id=auth.uid() where id=a.id returning * into a;
  if p_decision='approved' then perform private.finalize_transaction(t.id); else update transactions set status='rejected',updated_at=now() where id=t.id; end if;
  insert into audit_logs(mosque_id,actor_id,entity_type,entity_id,action,reason,after_data) values(a.mosque_id,auth.uid(),'approval',a.id,p_decision::text,p_note,to_jsonb(a));
  return a;
end $$;
