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

export async function createMosque(name,city){
  return ok(await db().rpc('create_mosque',{p_name:name,p_city:city||null}));
}

export async function memberships(){
  return ok(await db().from('memberships')
    .select('*,mosques(*)')
    .eq('active',true)
    .order('created_at'));
}

export async function profile(id){
  return ok(await db().from('profiles').select('*').eq('id',id).maybeSingle());
}

export async function dashboard(mosqueId){
  const [funds,cash,rec,tx,periods,notes]=await Promise.all([
    db().from('v_fund_balances').select('*').eq('mosque_id',mosqueId).order('name'),
    db().from('v_cash_balances').select('*').eq('mosque_id',mosqueId).order('name'),
    db().rpc('reconciliation',{p_mosque_id:mosqueId}),
    db().from('transactions')
      .select('*,categories(name,budget_group),funds(name,restricted),cash_accounts:cash_accounts!transactions_cash_account_id_fkey(name,kind),to_cash:cash_accounts!transactions_to_cash_account_id_fkey(name,kind),donors(name),units(name)')
      .eq('mosque_id',mosqueId)
      .order('tx_date',{ascending:false})
      .order('created_at',{ascending:false})
      .limit(500),
    db().from('periods').select('*').eq('mosque_id',mosqueId).order('starts_on',{ascending:false}),
    db().from('notifications').select('*').eq('mosque_id',mosqueId).order('created_at',{ascending:false}).limit(100)
  ]);
  return {
    funds:ok(funds)||[],
    cash:ok(cash)||[],
    reconciliation:(ok(rec)||[])[0]||null,
    transactions:ok(tx)||[],
    periods:ok(periods)||[],
    notifications:ok(notes)||[]
  };
}

export async function list(table,mosqueId,columns='*',order){
  let q=db().from(table).select(columns).eq('mosque_id',mosqueId);
  if(order)q=q.order(order,{ascending:false});
  return ok(await q);
}

export async function createRecord(table,payload){
  return ok(await db().from(table).insert(payload).select().single());
}

export async function updateRecord(table,id,payload){
  return ok(await db().from(table).update(payload).eq('id',id).select().single());
}

export async function upsertRecord(table,payload,onConflict){
  return ok(await db().from(table).upsert(payload,{onConflict}).select().single());
}

export async function createTransaction(payload,allocations=[]){
  const tx=await createRecord('transactions',payload);
  if(payload.kind==='transfer'&&allocations.length){
    const rows=allocations
      .filter(x=>Number(x.amount)>0)
      .map(x=>({transaction_id:tx.id,fund_id:x.fund_id,amount:Number(x.amount)}));
    if(rows.length)ok(await db().from('transfer_allocations').insert(rows));
  }
  return tx;
}

export async function postTransaction(id){
  return ok(await db().rpc('post_transaction',{p_transaction_id:id}));
}

export async function voidTransaction(id,reason){
  return ok(await db().rpc('void_transaction',{p_transaction_id:id,p_reason:reason}));
}

export async function decideApproval(id,decision,note=''){
  return ok(await db().rpc('decide_approval',{
    p_approval_id:id,
    p_decision:decision,
    p_note:note||null
  }));
}

export async function postDonationBox(id){
  return ok(await db().rpc('post_donation_box',{p_session_id:id}));
}

export async function createDonationBoxSession(mosqueId,payload,counts=[]){
  const session=await createRecord('donation_box_sessions',{
    mosque_id:mosqueId,
    counted_on:payload.counted_on,
    witness_1:payload.witness_1,
    witness_2:payload.witness_2,
    status:'draft',
    fund_id:payload.fund_id||null,
    cash_account_id:payload.cash_account_id||null,
    created_by:payload.created_by
  });
  const rows=counts
    .filter(x=>x.location&&Number(x.large_notes||0)+Number(x.small_notes||0)+Number(x.coins||0)+Number(x.other||0)>0)
    .map(x=>({
      session_id:session.id,
      location:x.location,
      large_notes:Number(x.large_notes)||0,
      small_notes:Number(x.small_notes)||0,
      coins:Number(x.coins)||0,
      other:Number(x.other)||0
    }));
  if(!rows.length)throw new Error('Tambahkan minimal satu titik kotak amal dengan nominal lebih dari Rp0.');
  ok(await db().from('donation_box_counts').insert(rows));
  return session;
}

export async function uploadEvidence(mosqueId,file,bucket='transaction-evidence'){
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'-');
  const path=`${mosqueId}/${crypto.randomUUID()}-${safe}`;
  ok(await db().storage.from(bucket).upload(path,file));
  return path;
}

export async function signedFileUrl(path,bucket='transaction-evidence',expires=120){
  if(!path)return null;
  const {data,error}=await db().storage.from(bucket).createSignedUrl(path,expires);
  if(error)throw error;
  return data?.signedUrl||null;
}

export async function markNotificationRead(id){
  return ok(await db().from('notifications')
    .update({read_at:new Date().toISOString()})
    .eq('id',id)
    .select()
    .single());
}

export async function addMember(mosqueId,email,role){
  const {data,error}=await db().functions.invoke('add-member',{body:{mosqueId,email,role}});
  if(error)throw error;
  if(data?.error)throw new Error(data.error);
  return data;
}

export async function getModuleData(mosqueId){
  const [
    funds,cash,categories,donors,units,budgets,inventory,
    boxes,approvals,settings,membersRes,audits
  ]=await Promise.all([
    list('funds',mosqueId),
    list('cash_accounts',mosqueId),
    list('categories',mosqueId),
    list('donors',mosqueId,'*','created_at'),
    list('units',mosqueId),
    list('budgets',mosqueId),
    list('inventory',mosqueId),
    list('donation_box_sessions',mosqueId,'*','created_at'),
    list('approvals',mosqueId,'*,transactions(*)'),
    db().from('settings').select('*').eq('mosque_id',mosqueId).maybeSingle(),
    db().from('memberships').select('*').eq('mosque_id',mosqueId).eq('active',true),
    db().from('audit_logs').select('*').eq('mosque_id',mosqueId).order('created_at',{ascending:false}).limit(100)
  ]);

  const members=ok(membersRes)||[];
  const ids=[...new Set(members.map(x=>x.user_id).filter(Boolean))];
  let people=[];
  if(ids.length){
    const res=await db().from('profiles').select('id,full_name,avatar_url').in('id',ids);
    if(!res.error)people=res.data||[];
  }
  const byId=new Map(people.map(x=>[x.id,x]));
  const membersWithProfiles=members.map(x=>({...x,profiles:byId.get(x.user_id)||null}));

  const boxRows=boxes||[];
  const boxIds=boxRows.map(x=>x.id);
  let counts=[];
  if(boxIds.length){
    const res=await db().from('donation_box_counts').select('*').in('session_id',boxIds);
    counts=ok(res)||[];
  }
  const countMap=new Map();
  for(const c of counts){
    const arr=countMap.get(c.session_id)||[];
    arr.push(c);
    countMap.set(c.session_id,arr);
  }
  const boxesWithCounts=boxRows.map(x=>({...x,counts:countMap.get(x.id)||[]}));

  return {
    funds:funds||[],
    cash:cash||[],
    categories:categories||[],
    donors:donors||[],
    units:units||[],
    budgets:budgets||[],
    inventory:inventory||[],
    boxes:boxesWithCounts,
    approvals:approvals||[],
    settings:ok(settings),
    members:membersWithProfiles,
    audits:ok(audits)||[]
  };
}

export async function createOpeningSetup(mosqueId,{
  periodName,startsOn,endsOn,fundName,fundOpening,cashName,cashKind
}){
  const period=await createRecord('periods',{
    mosque_id:mosqueId,
    name:periodName,
    starts_on:startsOn,
    ends_on:endsOn
  });
  const amount=Number(fundOpening)||0;
  const fund=await createRecord('funds',{
    mosque_id:mosqueId,
    code:'DANA-001',
    name:fundName||'Infaq Umum',
    restricted:false,
    opening_balance:amount
  });
  const cash=await createRecord('cash_accounts',{
    mosque_id:mosqueId,
    code:'KAS-001',
    name:cashName||'Kas Tunai',
    kind:cashKind||'cash',
    opening_balance:amount
  });
  await createRecord('opening_allocations',{
    mosque_id:mosqueId,
    period_id:period.id,
    fund_id:fund.id,
    cash_account_id:cash.id,
    amount
  });
  await Promise.all([
    createRecord('categories',{
      mosque_id:mosqueId,
      kind:'income',
      code:'PM-001',
      name:'Infaq / Donasi',
      default_fund_id:fund.id
    }),
    createRecord('categories',{
      mosque_id:mosqueId,
      kind:'expense',
      code:'PK-001',
      name:'Operasional Masjid',
      budget_group:'Operasional Masjid'
    })
  ]);
  return {period,fund,cash};
}
