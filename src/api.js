import { requireSupabase } from './supabase';
const db=()=>requireSupabase();
const ok=({data,error})=>{if(error)throw error;return data};
export const auth={
 signUp:async(email,password,fullName)=>{
  const client=db();
  const {data,error}=await client.functions.invoke('register-user',{body:{email,password,fullName}});
  if(error)throw error;
  if(data?.error)throw new Error(data.error);
  return client.auth.signInWithPassword({email,password});
 },
 signIn:(email,password)=>db().auth.signInWithPassword({email,password}),
 signOut:()=>db().auth.signOut(),
 session:()=>db().auth.getSession(),
 onChange:(cb)=>db().auth.onAuthStateChange(cb)
};
export async function createMosque(name,city){return ok(await db().rpc('create_mosque',{p_name:name,p_city:city||null}));}
export async function memberships(){return ok(await db().from('memberships').select('*,mosques(*)').eq('active',true).order('created_at'));}
export async function profile(id){return ok(await db().from('profiles').select('*').eq('id',id).maybeSingle());}
export async function dashboard(mosqueId){
 const [funds,cash,rec,tx,periods,notes]=await Promise.all([
  db().from('v_fund_balances').select('*').eq('mosque_id',mosqueId),
  db().from('v_cash_balances').select('*').eq('mosque_id',mosqueId),
  db().rpc('reconciliation',{p_mosque_id:mosqueId}),
  db().from('transactions').select('*,categories(name),funds(name),cash_accounts(name),to_cash:cash_accounts!transactions_to_cash_account_id_fkey(name)').eq('mosque_id',mosqueId).order('tx_date',{ascending:false}).limit(50),
  db().from('periods').select('*').eq('mosque_id',mosqueId).order('starts_on',{ascending:false}),
  db().from('notifications').select('*').eq('mosque_id',mosqueId).order('created_at',{ascending:false}).limit(20)
 ]);
 return {funds:ok(funds),cash:ok(cash),reconciliation:ok(rec)?.[0],transactions:ok(tx),periods:ok(periods),notifications:ok(notes)};
}
export async function list(table,mosqueId,columns='*',order){let q=db().from(table).select(columns).eq('mosque_id',mosqueId);if(order)q=q.order(order,{ascending:false});return ok(await q);}
export async function createRecord(table,payload){return ok(await db().from(table).insert(payload).select().single());}
export async function updateRecord(table,id,payload){return ok(await db().from(table).update(payload).eq('id',id).select().single());}
export async function upsertRecord(table,payload,onConflict){return ok(await db().from(table).upsert(payload,{onConflict}).select().single());}
export async function createTransaction(payload,allocations=[]){
 const tx=await createRecord('transactions',payload);
 if(payload.kind==='transfer'&&allocations.length){const rows=allocations.filter(x=>Number(x.amount)>0).map(x=>({transaction_id:tx.id,fund_id:x.fund_id,amount:Number(x.amount)}));if(rows.length)ok(await db().from('transfer_allocations').insert(rows));}
 return tx;
}
export async function postTransaction(id){return ok(await db().rpc('post_transaction',{p_transaction_id:id}));}
export async function voidTransaction(id,reason){return ok(await db().rpc('void_transaction',{p_transaction_id:id,p_reason:reason}));}
export async function decideApproval(id,decision,note=''){return ok(await db().rpc('decide_approval',{p_approval_id:id,p_decision:decision,p_note:note||null}));}
export async function postDonationBox(id){return ok(await db().rpc('post_donation_box',{p_session_id:id}));}
export async function uploadEvidence(mosqueId,file,bucket='transaction-evidence'){const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'-');const path=`${mosqueId}/${crypto.randomUUID()}-${safe}`;ok(await db().storage.from(bucket).upload(path,file));return path;}
export async function markNotificationRead(id){return ok(await db().from('notifications').update({read_at:new Date().toISOString()}).eq('id',id).select().single());}
export async function getModuleData(mosqueId){
 const [funds,cash,categories,donors,units,budgets,inventory,boxes,approvals,settings,members]=await Promise.all([
  list('funds',mosqueId),list('cash_accounts',mosqueId),list('categories',mosqueId),list('donors',mosqueId),list('units',mosqueId),list('budgets',mosqueId),list('inventory',mosqueId),
  list('donation_box_sessions',mosqueId,'*','created_at'),list('approvals',mosqueId,'*,transactions(*)'),db().from('settings').select('*').eq('mosque_id',mosqueId).maybeSingle(),
  db().from('memberships').select('*,profiles:user_id(full_name,avatar_url)').eq('mosque_id',mosqueId).eq('active',true)
 ]);
 return {funds,cash,categories,donors,units,budgets,inventory,boxes,approvals,settings:ok(settings),members:ok(members)};
}
export async function createOpeningSetup(mosqueId,{periodName,startsOn,endsOn,fundName,fundOpening,cashName,cashKind}){
 const period=await createRecord('periods',{mosque_id:mosqueId,name:periodName,starts_on:startsOn,ends_on:endsOn});
 const amount=Number(fundOpening)||0;
 const fund=await createRecord('funds',{mosque_id:mosqueId,code:'DANA-001',name:fundName||'Infaq Umum',restricted:false,opening_balance:amount});
 const cash=await createRecord('cash_accounts',{mosque_id:mosqueId,code:'KAS-001',name:cashName||'Kas Tunai',kind:cashKind||'cash',opening_balance:amount});
 await createRecord('opening_allocations',{mosque_id:mosqueId,period_id:period.id,fund_id:fund.id,cash_account_id:cash.id,amount});
 await Promise.all([
  createRecord('categories',{mosque_id:mosqueId,kind:'income',code:'PM-001',name:'Infaq / Donasi',default_fund_id:fund.id}),
  createRecord('categories',{mosque_id:mosqueId,kind:'expense',code:'PK-001',name:'Operasional Masjid',budget_group:'Operasional Masjid'})
 ]);
 return {period,fund,cash};
}
