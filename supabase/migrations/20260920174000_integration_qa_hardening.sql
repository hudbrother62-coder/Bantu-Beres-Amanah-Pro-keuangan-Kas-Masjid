-- Integration QA hardening for financial immutability, tenant integrity,
-- approval atomicity, and idempotent donation-box posting.

create or replace function public.guard_transaction_mutation()
returns trigger language plpgsql set search_path=public as $$
declare period_status text;
begin
  if tg_op='INSERT' then
    if current_user<>'postgres' then new.created_by:=auth.uid(); end if;
    return new;
  end if;
  if current_user<>'postgres' then
    if old.status in ('posted','voided') then raise exception 'Posted or voided financial transactions are immutable; use approved RPC operations'; end if;
    select status into period_status from public.periods where id=old.period_id;
    if period_status='closed' then raise exception 'Closed period transactions cannot be modified'; end if;
    if new.mosque_id<>old.mosque_id or new.created_by<>old.created_by then raise exception 'Transaction ownership fields are immutable'; end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_transaction_mutation on public.transactions;
create trigger guard_transaction_mutation before insert or update on public.transactions for each row execute function public.guard_transaction_mutation();
revoke all on function public.guard_transaction_mutation() from public,anon,authenticated;

create unique index if not exists approvals_one_pending_per_transaction on public.approvals(transaction_id) where status='pending';

-- post_transaction is recreated with an optional internal approval bypass.
drop function if exists public.post_transaction(uuid);
create function public.post_transaction(p_transaction_id uuid,p_skip_approval boolean default false)
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
  if not p_skip_approval and coalesce(s.approval_enabled,false) and (s.approval_threshold is null or t.amount>=s.approval_threshold) then
    select m.user_id into approver from memberships m where m.mosque_id=t.mosque_id and m.active and m.role in ('owner','treasurer') and (not coalesce(s.four_eyes,false) or m.user_id<>t.created_by) order by case when m.role='owner' then 0 else 1 end,m.created_at limit 1;
    if approver is null then raise exception 'No eligible approver configured'; end if;
    update transactions set status='pending',updated_at=now() where id=t.id returning * into t;
    insert into approvals(mosque_id,transaction_id,approver_id,status) values(t.mosque_id,t.id,approver,'pending') on conflict do nothing;
    insert into audit_logs(mosque_id,actor_id,entity_type,entity_id,action,after_data) values(t.mosque_id,auth.uid(),'transaction',t.id,'submitted_for_approval',to_jsonb(t));
    return t;
  end if;
  update transactions set status='posted',posted_at=now(),updated_at=now() where id=t.id returning * into t;
  insert into audit_logs(mosque_id,actor_id,entity_type,entity_id,action,after_data) values(t.mosque_id,auth.uid(),'transaction',t.id,'posted',to_jsonb(t));
  return t;
end $$;
revoke all on function public.post_transaction(uuid,boolean) from public,anon;
grant execute on function public.post_transaction(uuid,boolean) to authenticated;

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
  if p_decision='approved' then update transactions set status='draft',updated_at=now() where id=t.id; perform public.post_transaction(t.id,true);
  else update transactions set status='rejected',updated_at=now() where id=t.id; end if;
  insert into audit_logs(mosque_id,actor_id,entity_type,entity_id,action,reason,after_data) values(a.mosque_id,auth.uid(),'approval',a.id,p_decision::text,p_note,to_jsonb(a));
  return a;
end $$;
revoke all on function public.decide_approval(uuid,approval_status,text) from public,anon;
grant execute on function public.decide_approval(uuid,approval_status,text) to authenticated;

create or replace function public.post_donation_box(p_session_id uuid)
returns transactions language plpgsql security definer set search_path=public as $$
declare s donation_box_sessions; total numeric; p periods; tx transactions; doc text;
begin
  select * into s from donation_box_sessions where id=p_session_id for update;
  if s.id is null or not private.is_finance_manager(s.mosque_id) then raise exception 'Not allowed'; end if;
  if s.posted_transaction_id is not null or s.status='posted' then select * into tx from transactions where id=s.posted_transaction_id; return tx; end if;
  if coalesce(trim(s.witness_1),'')='' or coalesce(trim(s.witness_2),'')='' then raise exception 'Two witnesses are required'; end if;
  if s.fund_id is null or s.cash_account_id is null then raise exception 'Fund and cash account are required'; end if;
  if not exists(select 1 from funds f where f.id=s.fund_id and f.mosque_id=s.mosque_id) then raise exception 'Fund does not belong to mosque'; end if;
  if not exists(select 1 from cash_accounts c where c.id=s.cash_account_id and c.mosque_id=s.mosque_id) then raise exception 'Cash account does not belong to mosque'; end if;
  select coalesce(sum(large_notes+small_notes+coins+other),0) into total from donation_box_counts where session_id=s.id;
  if total<=0 then raise exception 'Donation box total must be positive'; end if;
  select * into p from periods where mosque_id=s.mosque_id and status='open' and s.counted_on between starts_on and ends_on order by starts_on desc limit 1;
  if p.id is null then raise exception 'No open period covers donation box date'; end if;
  doc:='BKM-KA-'||to_char(s.counted_on,'YYYYMMDD')||'-'||upper(substr(replace(s.id::text,'-',''),1,6));
  insert into transactions(mosque_id,period_id,document_no,kind,status,tx_date,amount,fund_id,cash_account_id,description,created_by) values(s.mosque_id,p.id,doc,'income','draft',s.counted_on,total,s.fund_id,s.cash_account_id,'Kotak Amal',auth.uid()) returning * into tx;
  tx:=public.post_transaction(tx.id);
  update donation_box_sessions set status=case when tx.status='posted' then 'posted' else 'pending' end,posted_transaction_id=tx.id where id=s.id;
  insert into audit_logs(mosque_id,actor_id,entity_type,entity_id,action,after_data) values(s.mosque_id,auth.uid(),'donation_box_session',s.id,'submitted',jsonb_build_object('transaction_id',tx.id,'amount',total,'status',tx.status));
  return tx;
end $$;
revoke all on function public.post_donation_box(uuid) from public,anon;
grant execute on function public.post_donation_box(uuid) to authenticated;
