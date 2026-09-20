import { requireSupabase } from './supabase';
const db=()=>requireSupabase();
const ok=({data,error})=>{if(error)throw error;return data};
export const auth={
 signUp:(email,password,fullName)=>db().auth.signUp({email,password,options:{data:{full_name:fullName}}}),
 signIn:(email,password)=>db().auth.signInWithPassword({email,password}),
 signOut:()=>db().auth.signOut(), session:()=>db().auth.getSession()
};
export async function createMosque(name,city){return ok(await db().rpc('create_mosque',{p_name:name,p_city:city}));}
export async function memberships(){return ok(await db().from('memberships').select('*,mosques(*)').eq('active',true));}
export async function dashboard(mosqueId){
 const [funds,cash,rec,tx]=await Promise.all([
  db().from('v_fund_balances').select('*').eq('mosque_id',mosqueId),
  db().from('v_cash_balances').select('*').eq('mosque_id',mosqueId),
  db().rpc('reconciliation',{p_mosque_id:mosqueId}),
  db().from('transactions').select('*,categories(name),funds(name),cash_accounts(name)').eq('mosque_id',mosqueId).order('tx_date',{ascending:false}).limit(8)
 ]);return {funds:ok(funds),cash:ok(cash),reconciliation:ok(rec)?.[0],transactions:ok(tx)};
}
export async function list(table,mosqueId,columns='*'){return ok(await db().from(table).select(columns).eq('mosque_id',mosqueId));}
export async function createRecord(table,payload){return ok(await db().from(table).insert(payload).select().single());}
export async function updateRecord(table,id,payload){return ok(await db().from(table).update(payload).eq('id',id).select().single());}
export async function createTransaction(payload){return createRecord('transactions',payload);}
export async function postTransaction(id){return ok(await db().rpc('post_transaction',{p_transaction_id:id}));}
export async function voidTransaction(id,reason){return ok(await db().rpc('void_transaction',{p_transaction_id:id,p_reason:reason}));}
export async function uploadEvidence(mosqueId,file){const path=`${mosqueId}/${crypto.randomUUID()}-${file.name}`;const r=await db().storage.from('transaction-evidence').upload(path,file);ok(r);return path;}
export async function notifications(mosqueId){return ok(await db().from('notifications').select('*').eq('mosque_id',mosqueId).order('created_at',{ascending:false}));}
