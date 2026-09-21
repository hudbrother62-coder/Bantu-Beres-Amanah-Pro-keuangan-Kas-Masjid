import React,{useEffect,useMemo,useState}from'react';
import * as I from'lucide-react';
import{
  auth,createMosque,memberships,profile,dashboard,getModuleData,createOpeningSetup,
  createRecord,updateRecord,upsertRecord,createTransaction,postTransaction,voidTransaction,
  decideApproval,postDonationBox,createDonationBoxSession,uploadEvidence,markNotificationRead,
  markAllNotificationsRead,subscribeNotifications,addMember,signedFileUrl,insertRecords
}from'./api';
import{isSupabaseConfigured}from'./supabase';

const rp=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n)||0);
const num=n=>Number(n)||0;
const today=()=>new Date().toISOString().slice(0,10);
const fmtDate=v=>v?new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(v+'T00:00:00')):'—';
const fmtTime=v=>v?new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(v)):'—';
const roleLabel={owner:'Owner / Ketua',treasurer:'Bendahara',secretary:'Sekretaris',member:'Pengurus',viewer:'Viewer'};
const statusLabel={draft:'Draft',pending:'Menunggu',posted:'Tercatat',rejected:'Ditolak',voided:'Dibatalkan',approved:'Disetujui'};
const kindLabel={income:'Pemasukan',expense:'Pengeluaran',transfer:'Transfer'};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function retryAsync(fn,retries=2){let last;for(let i=0;i<=retries;i++){try{return await fn()}catch(e){last=e;if(i<retries)await wait(500*(i+1))}}throw last}
const nav=[
  ['dashboard',I.LayoutDashboard,'Dashboard'],
  ['transactions',I.ArrowLeftRight,'Transaksi'],
  ['funds',I.WalletCards,'Dana & Kas'],
  ['boxes',I.Box,'Kotak Amal'],
  ['donors',I.HandHeart,'Donatur'],
  ['units',I.Store,'Unit Masjid'],
  ['budgets',I.ChartNoAxesColumnIncreasing,'Anggaran'],
  ['inventory',I.Package,'Inventaris'],
  ['reports',I.FileText,'Laporan'],
  ['approvals',I.ShieldCheck,'Persetujuan'],
  ['notifications',I.Bell,'Notifikasi'],
  ['team',I.UserRoundCog,'Tim & Akses'],
  ['guide',I.BookOpenCheck,'Panduan Penggunaan'],
  ['settings',I.Settings,'Pengaturan']
];

function Logo({compact=false}){return <div className={'brandPro '+(compact?'compact':'')}><img src="/bantu-beres-logo.webp" alt="Bantu Beres"/><div><strong>Bantu Beres</strong><span>AMANAH PRO</span></div></div>}
function Badge({children,tone=''}){return <span className={'pill '+tone}>{children}</span>}
function Button({children,variant='default',className='',...p}){return <button className={'btn '+variant+' '+className} {...p}>{children}</button>}
function Loading(){return <div className="fullState"><I.LoaderCircle className="spin"/><h3>Menyiapkan Amanah Pro</h3><p>Sinkronisasi data keuangan dan akses masjid.</p></div>}
function Empty({icon:Icon=I.Inbox,title,text,action}){return <div className="emptyPro"><Icon/><h3>{title}</h3><p>{text}</p>{action}</div>}
function Metric({icon:Icon,title,value,meta,tone=''}){return <article className={'metric '+tone}><div className="metricIcon"><Icon/></div><div><span>{title}</span><strong>{value}</strong>{meta&&<small>{meta}</small>}</div></article>}
function SectionHead({title,text,action}){return <div className="sectionHead"><div><h2>{title}</h2>{text&&<p>{text}</p>}</div>{action}</div>}
function PageHead({eyebrow,title,text,action}){return <div className="pageHeadPro"><div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{text&&<p>{text}</p>}</div>{action}</div>}
function Modal({title,text,close,children,size='md',footer}){return <div className="overlayPro" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section className={'modalPro '+size}><div className="modalTop"><div><h2>{title}</h2>{text&&<p>{text}</p>}</div><button className="iconBtn" onClick={close}><I.X/></button></div><div className="modalBody">{children}</div>{footer&&<div className="modalFooter">{footer}</div>}</section></div>}

class AppErrorBoundary extends React.Component{
  constructor(p){super(p);this.state={error:null}}
  static getDerivedStateFromError(error){return{error}}
  componentDidCatch(error,info){console.error('Amanah Pro render error',error,info)}
  render(){
    if(this.state.error)return <div className="authShellPro"><div className="authPanel"><Logo/><h1>Halaman perlu dimuat ulang</h1><p>Data Anda tetap aman. Terjadi masalah saat menampilkan antarmuka.</p><div className="inlineAlert danger">{this.state.error?.message||'Terjadi kesalahan tampilan.'}</div><Button variant="primary" onClick={()=>location.reload()}>Muat ulang</Button><Button variant="ghost" onClick={()=>auth.signOut()}>Keluar akun</Button></div></div>;
    return this.props.children;
  }
}

export default function App(){
  const[session,setSession]=useState(null),[boot,setBoot]=useState(true),[error,setError]=useState('');
  useEffect(()=>{
    if(!isSupabaseConfigured){setBoot(false);return}
    auth.session().then(({data})=>{setSession(data.session);setBoot(false)}).catch(e=>{setError(e.message);setBoot(false)});
    const{data:{subscription}}=auth.onChange((_e,s)=>setSession(s));
    return()=>subscription.unsubscribe()
  },[]);
  if(boot)return <Loading/>;
  if(!isSupabaseConfigured)return <div className="authShellPro"><div className="authPanel"><Logo/><h1>Konfigurasi belum lengkap</h1><p>Supabase belum terhubung ke aplikasi.</p></div></div>;
  if(!session)return <Auth/>;
  return <AppErrorBoundary><Workspace session={session} globalError={error}/></AppErrorBoundary>
}

function Auth(){
  const[mode,setMode]=useState('login');
  const[form,setForm]=useState({name:'',email:'',password:''});
  const[busy,setBusy]=useState(false),[err,setErr]=useState('');
  const submit=async e=>{
    e.preventDefault();setBusy(true);setErr('');
    try{
      if(mode==='login')await auth.signIn(form.email,form.password);
      else await auth.signUp(form.email,form.password,form.name);
    }catch(x){setErr(x.message||'Tidak dapat memproses akun.')}finally{setBusy(false)}
  };
  return <div className="authShellPro">
    <div className="authShowcase">
      <Logo/>
      <div className="authCopy"><Badge tone="brand">Keuangan & Kas Masjid</Badge><h1>Amanah keuangan lebih rapi, transparan, dan mudah diawasi.</h1><p>Pisahkan Dana dan Kas, catat transaksi, kontrol anggaran, dan buat laporan dalam satu sistem.</p></div>
      <div className="authPoints"><span><I.ShieldCheck/>Dana terikat tetap terjaga</span><span><I.BarChart3/>Rekap otomatis dari transaksi</span><span><I.Smartphone/>Nyaman di HP maupun desktop</span></div>
    </div>
    <form className="authPanel" onSubmit={submit}>
      <div className="mobileAuthLogo"><Logo/></div>
      <span className="eyebrow">{mode==='login'?'SELAMAT DATANG':'MULAI AMANAH PRO'}</span>
      <h1>{mode==='login'?'Masuk ke akun Anda':'Buat akun baru'}</h1>
      <p>{mode==='login'?'Lanjutkan pengelolaan keuangan masjid.':'Tidak perlu verifikasi email. Setelah daftar Anda langsung masuk.'}</p>
      {err&&<div className="inlineAlert danger"><I.CircleAlert/>{err}</div>}
      {mode==='register'&&<label>Nama lengkap<input required autoComplete="name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Nama pengurus"/></label>}
      <label>Email<input type="email" required autoComplete="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="nama@email.com"/></label>
      <label>Password<input type="password" minLength="6" required autoComplete={mode==='login'?'current-password':'new-password'} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Minimal 6 karakter"/></label>
      <Button variant="primary" className="wide" disabled={busy}>{busy?<><I.LoaderCircle className="spin"/>Memproses...</>:mode==='login'?'Masuk':'Buat Akun & Masuk'}</Button>
      <button type="button" className="textLink" onClick={()=>{setMode(mode==='login'?'register':'login');setErr('')}}>{mode==='login'?'Belum punya akun? Daftar gratis':'Sudah punya akun? Masuk'}</button>
    </form>
  </div>
}

function Onboarding({done}){
  const[step,setStep]=useState(1),[mid,setMid]=useState('');
  const[f,setF]=useState({name:'',city:'',period:String(new Date().getFullYear()),start:new Date().getFullYear()+'-01-01',end:new Date().getFullYear()+'-12-31',fund:'Infaq Umum',amount:0,cash:'Kas Tunai'});
  const[busy,setBusy]=useState(false),[err,setErr]=useState('');
  const create=async()=>{setBusy(true);setErr('');try{const id=await createMosque(f.name,f.city);setMid(id);setStep(2)}catch(e){setErr(e.message)}finally{setBusy(false)}};
  const finish=async()=>{setBusy(true);setErr('');try{await createOpeningSetup(mid,{periodName:f.period,startsOn:f.start,endsOn:f.end,fundName:f.fund,fundOpening:f.amount,cashName:f.cash,cashKind:'cash'});done(mid)}catch(e){setErr(e.message)}finally{setBusy(false)}};
  return <div className="authShellPro onboardingShell"><div className="onboardPanel">
    <div className="onboardTop"><Logo/><div className="stepper"><span className={step>=1?'done':''}>1</span><i/><span className={step>=2?'done':''}>2</span></div></div>
    <span className="eyebrow">SETUP AWAL</span>
    <h1>{step===1?'Kenalkan masjid Anda':'Siapkan fondasi keuangan'}</h1>
    <p>{step===1?'Informasi ini akan muncul pada laporan dan identitas workspace.':'Dana menjelaskan peruntukan uang, sedangkan Kas menjelaskan uang disimpan di mana.'}</p>
    {err&&<div className="inlineAlert danger"><I.CircleAlert/>{err}</div>}
    {step===1?<div className="formStack"><label>Nama masjid<input value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="Contoh: Masjid Al Amanah"/></label><label>Kota / Kabupaten<input value={f.city} onChange={e=>setF({...f,city:e.target.value})} placeholder="Contoh: Malang"/></label><Button variant="primary" disabled={!f.name||busy} onClick={create}>Lanjutkan <I.ArrowRight/></Button></div>:<div className="formStack"><div className="formGrid2"><label>Nama periode<input value={f.period} onChange={e=>setF({...f,period:e.target.value})}/></label><label>Saldo awal<input type="number" min="0" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/></label><label>Tanggal mulai<input type="date" value={f.start} onChange={e=>setF({...f,start:e.target.value})}/></label><label>Tanggal selesai<input type="date" value={f.end} onChange={e=>setF({...f,end:e.target.value})}/></label><label>Dana awal<input value={f.fund} onChange={e=>setF({...f,fund:e.target.value})}/></label><label>Kas / Rekening awal<input value={f.cash} onChange={e=>setF({...f,cash:e.target.value})}/></label></div><div className="infoCard"><I.Scale/><div><b>Mulai dalam kondisi seimbang</b><p>Total Dana dan Total Kas dibuat sama sebesar {rp(f.amount)}.</p></div></div><div className="rowActions"><Button onClick={()=>setStep(1)}>Kembali</Button><Button variant="primary" disabled={busy} onClick={finish}>{busy?'Menyiapkan...':'Mulai Amanah Pro'} <I.ArrowRight/></Button></div></div>}
  </div></div>
}

function Workspace({session,globalError}){
  const[ms,setMs]=useState([]),[active,setActive]=useState(localStorage.amanahMosque||''),[me,setMe]=useState(null);
  const[loading,setLoading]=useState(true),[syncing,setSyncing]=useState(false),[accessResolved,setAccessResolved]=useState(false),[refresh,setRefresh]=useState(0),[data,setData]=useState(null),[mods,setMods]=useState(null);
  const[page,setPage]=useState(location.hash.slice(1)||'dashboard'),[dark,setDark]=useState(localStorage.theme==='dark');
  const[action,setAction]=useState(null),[toast,setToast]=useState(''),[err,setErr]=useState(globalError||''),[mobileMore,setMobileMore]=useState(false),[collapsed,setCollapsed]=useState(localStorage.sidebarCollapsed==='1');
  const reload=()=>setRefresh(x=>x+1);
  const notify=m=>{setToast(m);setTimeout(()=>setToast(''),3000)};
  const go=p=>{location.hash=p;setMobileMore(false)};

  useEffect(()=>{
    let alive=true;
    setLoading(true);setAccessResolved(false);
    retryAsync(()=>Promise.all([memberships(),profile(session.user.id)]),2).then(([m,p])=>{
      if(!alive)return;
      const rows=m||[];setMs(rows);setMe(p);setAccessResolved(true);setErr('');
      if(!rows.length){setActive('');setData(null);setMods(null);localStorage.removeItem('amanahMosque');return}
      const saved=localStorage.amanahMosque||active;
      const next=rows.some(x=>x.mosque_id===saved)?saved:rows[0].mosque_id;
      setActive(next);localStorage.amanahMosque=next;
    }).catch(e=>{
      if(!alive)return;
      setErr('Akses akun belum berhasil dimuat. Periksa koneksi lalu coba lagi. '+(e?.message||''));
      setAccessResolved(false);
    }).finally(()=>alive&&setLoading(false));
    return()=>{alive=false}
  },[refresh,session.user.id]);

  useEffect(()=>{
    if(!active)return;
    let alive=true;
    localStorage.amanahMosque=active;
    const cacheKey='amanahCache:'+active;
    let cached=null;
    try{cached=JSON.parse(sessionStorage.getItem(cacheKey)||'null')}catch{}
    if(cached?.d&&cached?.m){setData(cached.d);setMods(cached.m);setLoading(false)}
    else setLoading(true);
    setSyncing(true);
    retryAsync(()=>Promise.all([dashboard(active),getModuleData(active)]),2).then(([d,m])=>{
      if(!alive)return;
      setData(d);setMods(m);setErr('');
      try{sessionStorage.setItem(cacheKey,JSON.stringify({d,m,at:Date.now()}))}catch{}
    }).catch(e=>{
      if(!alive)return;
      if(cached?.d&&cached?.m)setErr('Koneksi ke server sedang lambat. Menampilkan data terakhir di sesi ini.');
      else{setErr('Data belum berhasil dimuat setelah beberapa percobaan. '+(e?.message||''));setData(null);setMods(null)}
    }).finally(()=>{if(alive){setLoading(false);setSyncing(false)}});
    return()=>{alive=false}
  },[active,refresh]);

  useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';localStorage.theme=dark?'dark':'light'},[dark]);
  useEffect(()=>{
    if(!active)return;
    return subscribeNotifications(active,n=>{
      setData(prev=>prev?{...prev,notifications:[n,...(prev.notifications||[])]}:prev);
      notify(n.title||'Ada notifikasi baru');
    });
  },[active]);
  useEffect(()=>{localStorage.sidebarCollapsed=collapsed?'1':'0'},[collapsed]);
  useEffect(()=>{const h=()=>setPage(location.hash.slice(1)||'dashboard');addEventListener('hashchange',h);return()=>removeEventListener('hashchange',h)},[]);

  const finishOnboarding=id=>{if(id){setActive(id);localStorage.amanahMosque=id}setRefresh(x=>x+1)};
  if(accessResolved&&!loading&&!ms.length)return <Onboarding done={finishOnboarding}/>;
  if(!accessResolved&&!loading&&!ms.length)return <div className="authShellPro"><div className="authPanel"><Logo/><h1>Akses akun belum berhasil dimuat</h1><p>{err||'Koneksi ke server belum stabil. Aplikasi tidak akan menganggap akun sebagai akun baru.'}</p><Button variant="primary" onClick={reload}><I.RefreshCw/>Coba Lagi</Button><Button variant="ghost" onClick={()=>auth.signOut()}>Keluar akun</Button></div></div>;
  const membership=ms.find(x=>x.mosque_id===active)||ms[0]||null;
  const mosque=membership?.mosques||null;
  if(loading&&(!data||!mods))return <Loading/>;
  if(!membership)return <div className="authShellPro"><div className="authPanel"><Logo/><h1>Akses masjid belum terbaca</h1><p>Silakan muat ulang atau masuk kembali.</p><Button variant="primary" onClick={reload}>Muat Ulang</Button></div></div>;
  if(!data||!mods)return <div className="authShellPro"><div className="authPanel"><Logo/><h1>Dashboard belum dapat dimuat</h1><p>{err||'Data belum berhasil dimuat.'}</p><Button variant="primary" onClick={reload}>Coba Muat Ulang</Button><Button variant="ghost" onClick={()=>auth.signOut()}>Keluar akun</Button></div></div>;

  const role=membership.role;
  const perms={
    finance:['owner','treasurer'].includes(role),
    manage:['owner','treasurer','secretary'].includes(role),
    approve:['owner','treasurer'].includes(role),
    team:role==='owner',
    view:true
  };
  const ctx={session,mosque,membership,role,perms,d:data,m:mods,reload,notify,open:setAction,go};

  return <div className={'shellPro '+(collapsed?'sideCollapsed':'')}>
    <aside className="sidePro">
      <div className="sideBrandRow"><Logo compact={collapsed}/><button className="collapseBtn" onClick={()=>setCollapsed(!collapsed)} title={collapsed?'Tampilkan navigasi':'Sembunyikan navigasi'}>{collapsed?<I.PanelLeftOpen/>:<I.PanelLeftClose/>}</button></div>
      <div className="sideMosque"><span>MASJID</span><b>{mosque?.name}</b>{!collapsed&&<small>{mosque?.city||'Workspace Amanah Pro'}</small>}</div>
      <nav className="navPro">{nav.map(([k,Icon,l],idx)=><React.Fragment key={k}>{[0,3,8,11].includes(idx)&&idx>0?<div className="navDivider"/>:null}<button className={page===k?'active':''} onClick={()=>go(k)}><Icon/><span>{l}</span>{k==='notifications'&&data.notifications.filter(n=>!n.read_at).length>0&&<em>{data.notifications.filter(n=>!n.read_at).length}</em>}</button></React.Fragment>)}</nav>
      <div className="sideUser"><div className="avatarPro">{(me?.full_name||session.user.email).slice(0,2).toUpperCase()}</div><div><b>{me?.full_name||session.user.email}</b><span>{roleLabel[role]||role}</span></div><button className="iconBtn" onClick={()=>auth.signOut()} title="Keluar"><I.LogOut/></button></div>
    </aside>

    <main className="mainPro">
      {syncing&&<div className="syncBar"><i/></div>}
      <header className="topPro">
        <div className="topTitle"><button className="mobileBrand" onClick={()=>setMobileMore(true)}><I.Menu/></button><button className="desktopCollapse iconBtn" onClick={()=>setCollapsed(!collapsed)} title={collapsed?'Tampilkan navigasi':'Sembunyikan navigasi'}>{collapsed?<I.PanelLeftOpen/>:<I.PanelLeftClose/>}</button><div><span>{mosque?.name}</span><b>{nav.find(x=>x[0]===page)?.[2]||'Amanah Pro'}</b></div></div>
        <div className="topActions"><button className="iconBtn" onClick={()=>setDark(!dark)} title="Ganti tema">{dark?<I.Sun/>:<I.Moon/>}</button><button className="iconBtn notificationButton" onClick={()=>go('notifications')} aria-label="Notifikasi"><I.Bell/>{data.notifications.filter(n=>!n.read_at).length>0&&<span className="notifDot">{Math.min(99,data.notifications.filter(n=>!n.read_at).length)}</span>}</button>{perms.finance&&<Button variant="primary" onClick={()=>setAction({type:'transaction',preset:'income'})}><I.Plus/>Transaksi</Button>}</div>
      </header>
      {err&&<div className="topError" role="alert"><I.CircleAlert/>{err}<button onClick={()=>setErr('')}><I.X/></button></div>}
      <div className="contentPro"><div key={page} className="pageEnter"><Page page={page} {...ctx}/></div></div>
    </main>

    <BottomNav page={page} go={go} open={()=>perms.finance&&setAction({type:'transaction',preset:'income'})} more={()=>setMobileMore(true)} canFinance={perms.finance}/>
    {mobileMore&&<MobileMore page={page} go={go} close={()=>setMobileMore(false)} logout={()=>auth.signOut()} dark={dark} toggleTheme={()=>setDark(v=>!v)}/>}
    {action&&<ActionRouter action={action} close={()=>setAction(null)} {...ctx}/>}
    {toast&&<div className="toastPro" role="status" aria-live="polite"><I.CircleCheck/>{toast}</div>}
  </div>
}

function BottomNav({page,go,open,more,canFinance}){return <div className="bottomPro"><button className={page==='dashboard'?'active':''} onClick={()=>go('dashboard')}><I.Home/>Beranda</button><button className={page==='transactions'?'active':''} onClick={()=>go('transactions')}><I.ReceiptText/>Transaksi</button><button className="centerFab" aria-label="Tambah transaksi" disabled={!canFinance} onClick={open}><I.Plus/></button><button className={page==='reports'?'active':''} onClick={()=>go('reports')}><I.FileText/>Laporan</button><button className={!['dashboard','transactions','reports'].includes(page)?'active':''} onClick={more}><I.Menu/>Lainnya</button></div>}
function MobileMore({page,go,close,logout,dark,toggleTheme}){return <div className="mobileDrawerBack" onMouseDown={e=>e.target===e.currentTarget&&close()}><div className="mobileDrawer"><div className="drawerHandle"/><div className="drawerHead"><Logo compact/><button className="iconBtn" onClick={close}><I.X/></button></div><button className="mobileThemeSwitch" onClick={toggleTheme}><span>{dark?<I.Sun/>:<I.Moon/>}<b>{dark?'Mode Terang':'Mode Gelap'}</b></span><small>{dark?'Gunakan tampilan terang':'Gunakan tampilan gelap'}</small><I.ChevronRight/></button><div className="mobileGrid">{nav.map(([k,Icon,l])=><button key={k} className={page===k?'active':''} onClick={()=>go(k)}><Icon/><span>{l}</span></button>)}</div><Button className="wide" onClick={logout}><I.LogOut/>Keluar akun</Button></div></div>}

function Page(p){
  switch(p.page){
    case'dashboard':return <Dashboard {...p}/>;
    case'transactions':return <Transactions {...p}/>;
    case'funds':return <FundsCash {...p}/>;
    case'boxes':return <Boxes {...p}/>;
    case'donors':return <Donors {...p}/>;
    case'units':return <Units {...p}/>;
    case'budgets':return <Budgets {...p}/>;
    case'inventory':return <Inventory {...p}/>;
    case'reports':return <Reports {...p}/>;
    case'approvals':return <Approvals {...p}/>;
    case'notifications':return <Notifications {...p}/>;
    case'team':return <Team {...p}/>;
    case'guide':return <Guide {...p}/>;
    case'settings':return <Settings {...p}/>;
    default:return <Dashboard {...p}/>
  }
}

function Dashboard({d,m,perms,open,go}){
  const posted=d.transactions.filter(x=>x.status==='posted');
  const cashTotal=d.cash.reduce((s,x)=>s+num(x.balance),0);
  const fundTotal=d.funds.reduce((s,x)=>s+num(x.balance),0);
  const free=d.funds.filter(x=>!x.restricted).reduce((s,x)=>s+num(x.balance),0);
  const restricted=fundTotal-free;
  const income=posted.filter(x=>x.kind==='income').reduce((s,x)=>s+num(x.amount),0);
  const expense=posted.filter(x=>x.kind==='expense').reduce((s,x)=>s+num(x.amount),0);
  const pending=m.approvals.filter(x=>x.status==='pending').length;
  const warnings=[];
  if(!d.reconciliation?.is_balanced)warnings.push({tone:'danger',text:'Total Dana dan Kas belum seimbang',sub:'Selisih '+rp(d.reconciliation?.difference)});
  if(d.funds.some(x=>num(x.balance)<0))warnings.push({tone:'danger',text:'Ada Dana bernilai minus',sub:'Periksa transaksi dan alokasi dana'});
  if(d.cash.some(x=>num(x.balance)<0))warnings.push({tone:'danger',text:'Ada Kas/Rekening bernilai minus',sub:'Periksa sumber pembayaran'});
  if(pending)warnings.push({tone:'warning',text:pending+' transaksi menunggu persetujuan',sub:'Periksa menu Persetujuan'});
  if(!warnings.length)warnings.push({tone:'success',text:'Keuangan terpantau sehat',sub:'Dana dan Kas seimbang, tidak ada peringatan kritis'});

  const series=monthSeries(posted,6);
  const max=Math.max(1,...series.flatMap(x=>[x.income,x.expense]));
  const budgetUse=budgetRealization(m.budgets,posted);

  return <>
    <PageHead eyebrow="RINGKASAN KEUANGAN" title="Dashboard Amanah" text="Angka di bawah dihitung dari transaksi yang benar-benar tercatat (POSTED)." action={perms.finance?<Button variant="primary" onClick={()=>open({type:'transaction',preset:'income'})}><I.Plus/>Catat Transaksi</Button>:null}/>
    <div className="metricGrid">
      <Metric icon={I.Landmark} title="Total Kas" value={rp(cashTotal)} meta={d.cash.length+' lokasi kas/rekening'} tone="blue"/>
      <Metric icon={I.Wallet} title="Dana Bebas" value={rp(free)} meta="Dapat dipakai sesuai kebijakan" tone="purple"/>
      <Metric icon={I.LockKeyhole} title="Dana Terikat" value={rp(restricted)} meta="Memiliki peruntukan khusus" tone="amber"/>
      <Metric icon={income-expense>=0?I.TrendingUp:I.TrendingDown} title="Surplus / Defisit" value={rp(income-expense)} meta={'Masuk '+rp(income)+' • Keluar '+rp(expense)} tone={income-expense>=0?'green':'red'}/>
    </div>

    <div className="dashGrid">
      <section className="cardPro span2">
        <SectionHead title="Arus kas 6 bulan" text="Pemasukan dan pengeluaran yang sudah POSTED." action={<Button variant="ghost" onClick={()=>go('reports')}>Lihat laporan <I.ArrowUpRight/></Button>}/>
        <div className="chartPro">{series.map(x=><div className="barGroup" key={x.key}><div className="barArea"><i className="barIn" style={{height:Math.max(4,x.income/max*140)}} title={rp(x.income)}/><i className="barOut" style={{height:Math.max(4,x.expense/max*140)}} title={rp(x.expense)}/></div><span>{x.label}</span></div>)}</div>
        <div className="chartLegend"><span><i className="dot in"/>Pemasukan</span><span><i className="dot out"/>Pengeluaran</span></div>
      </section>

      <section className="cardPro healthPro">
        <SectionHead title="Kesehatan keuangan" text="Pemeriksaan otomatis sistem." action={<Badge tone={warnings.some(x=>x.tone==='danger')?'danger':warnings.some(x=>x.tone==='warning')?'warning':'success'}>{warnings.some(x=>x.tone==='danger')?'Perlu tindakan':warnings.some(x=>x.tone==='warning')?'Perlu perhatian':'Sehat'}</Badge>}/>
        <div className="healthList">{warnings.map((w,i)=><div className={'healthItem '+w.tone} key={i}>{w.tone==='success'?<I.CircleCheck/>:w.tone==='warning'?<I.TriangleAlert/>:<I.CircleAlert/>}<div><b>{w.text}</b><span>{w.sub}</span></div></div>)}</div>
      </section>
    </div>

    <div className="dashGrid">
      <section className="cardPro">
        <SectionHead title="Posisi Dana" text="Uang dikelompokkan berdasarkan amanah/peruntukan." action={<Button variant="ghost" onClick={()=>go('funds')}>Kelola</Button>}/>
        <div className="denseList">{d.funds.slice(0,6).map(x=><div className="denseRow" key={x.id}><div className={'miniIcon '+(x.restricted?'amber':'purple')}>{x.restricted?<I.LockKeyhole/>:<I.Wallet/>}</div><div><b>{x.name}</b><span>{x.restricted?'Dana terikat':'Dana bebas'}</span></div><strong>{rp(x.balance)}</strong></div>)}</div>
      </section>
      <section className="cardPro">
        <SectionHead title="Kas & Rekening" text="Lokasi uang masjid saat ini." action={<Button variant="ghost" onClick={()=>go('funds')}>Kelola</Button>}/>
        <div className="denseList">{d.cash.slice(0,6).map(x=><div className="denseRow" key={x.id}><div className="miniIcon blue">{x.kind==='bank'?<I.Landmark/>:x.kind==='ewallet'?<I.Smartphone/>:<I.Banknote/>}</div><div><b>{x.name}</b><span>{x.kind==='bank'?'Bank':x.kind==='ewallet'?'E-Wallet':x.kind==='cash'?'Tunai':'Lainnya'}</span></div><strong>{rp(x.balance)}</strong></div>)}</div>
      </section>
    </div>

    <div className="dashGrid">
      <section className="cardPro span2">
        <SectionHead title="Aktivitas terbaru" text="Riwayat transaksi terkini." action={<Button variant="ghost" onClick={()=>go('transactions')}>Lihat semua</Button>}/>
        <TransactionRows rows={d.transactions.slice(0,8)} onClick={x=>open({type:'tx-detail',item:x})}/>
      </section>
      <section className="cardPro">
        <SectionHead title="Serapan anggaran" text="Realisasi pengeluaran terhadap pagu." action={<Button variant="ghost" onClick={()=>go('budgets')}>Kelola</Button>}/>
        {!budgetUse.length?<Empty icon={I.PieChart} title="Belum ada anggaran" text="Buat anggaran agar realisasi dapat dipantau."/>:<div className="budgetMini">{budgetUse.slice(0,5).map(b=><div key={b.id}><div><b>{b.name}</b><span>{Math.round(b.percent)}%</span></div><div className="progressPro"><i style={{width:Math.min(100,b.percent)+'%'}} className={b.percent>=100?'danger':b.percent>=80?'warning':''}/></div><small>{rp(b.realized)} dari {rp(b.amount)}</small></div>)}</div>}
      </section>
    </div>
  </>
}

function Transactions({d,perms,open}){
  const[q,setQ]=useState(''),[kind,setKind]=useState('all'),[status,setStatus]=useState('all');
  const rows=useMemo(()=>d.transactions.filter(t=>{
    const hit=!q||(t.description||'').toLowerCase().includes(q.toLowerCase())||(t.document_no||'').toLowerCase().includes(q.toLowerCase())||(t.counterparty||'').toLowerCase().includes(q.toLowerCase());
    return hit&&(kind==='all'||t.kind===kind)&&(status==='all'||t.status===status);
  }),[d.transactions,q,kind,status]);
  return <>
    <PageHead eyebrow="BUKU TRANSAKSI" title="Seluruh Transaksi" text="Pemasukan, pengeluaran, transfer, approval dan pembatalan tercatat dalam satu histori." action={perms.finance?<Button variant="primary" onClick={()=>open({type:'transaction',preset:'income'})}><I.Plus/>Transaksi Baru</Button>:null}/>
    <div className="filterBar"><div className="searchPro"><I.Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari nomor, uraian, atau pihak..."/></div><select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">Semua jenis</option><option value="income">Pemasukan</option><option value="expense">Pengeluaran</option><option value="transfer">Transfer</option></select><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Semua status</option><option value="posted">Tercatat</option><option value="pending">Menunggu</option><option value="draft">Draft</option><option value="rejected">Ditolak</option><option value="voided">Dibatalkan</option></select></div>
    <section className="cardPro noPad">
      <div className="tableHead txHead"><span>Tanggal & Bukti</span><span>Transaksi</span><span>Dana / Kas</span><span>Nominal</span><span>Status</span></div>
      <TransactionRows rows={rows} onClick={x=>open({type:'tx-detail',item:x})} table/>
    </section>
  </>
}

function TransactionRows({rows,onClick,table=false}){
  if(!rows.length)return <Empty icon={I.ReceiptText} title="Belum ada transaksi" text="Data transaksi akan muncul setelah dicatat."/>;
  return <div className={'txRows '+(table?'tableMode':'')}>{rows.map(t=><button className="txRow" key={t.id} onClick={()=>onClick?.(t)}>
    <div className="txDate"><span>{fmtDate(t.tx_date)}</span><small>{t.document_no}</small></div>
    <div className="txMain"><div className={'txKind '+t.kind}>{t.kind==='income'?<I.ArrowDownLeft/>:t.kind==='expense'?<I.ArrowUpRight/>:<I.ArrowLeftRight/>}</div><div><b>{t.description}</b><small>{t.categories?.name||kindLabel[t.kind]}{t.counterparty?' • '+t.counterparty:''}</small></div></div>
    <div className="txSource"><span>{t.funds?.name||'—'}</span><small>{t.cash_accounts?.name||'—'}{t.kind==='transfer'&&t.to_cash?.name?' → '+t.to_cash.name:''}</small></div>
    <strong className={t.kind==='income'?'moneyIn':t.kind==='expense'?'moneyOut':''}>{t.kind==='expense'?'- ':t.kind==='income'?'+ ':''}{rp(t.amount)}</strong>
    <Badge tone={t.status==='posted'?'success':t.status==='pending'?'warning':t.status==='voided'||t.status==='rejected'?'danger':''}>{statusLabel[t.status]||t.status}</Badge>
  </button>)}</div>
}

function FundsCash({d,m,perms,open}){
  const[tab,setTab]=useState('funds');
  const rows=tab==='funds'?d.funds:d.cash;
  return <>
    <PageHead eyebrow="STRUKTUR KEUANGAN" title="Dana & Kas" text="Dana menjawab 'uang ini untuk apa', sedangkan Kas menjawab 'uang ini berada di mana'." action={perms.finance?<Button variant="primary" onClick={()=>open({type:tab==='funds'?'fund':'cash'})}><I.Plus/>{tab==='funds'?'Tambah Dana':'Tambah Kas'}</Button>:null}/>
    <div className="conceptStrip"><div><I.WalletCards/><b>Dana Amanah</b><span>Peruntukan dan batas penggunaan uang.</span></div><I.ArrowRight/><div><I.Landmark/><b>Kas & Rekening</b><span>Lokasi fisik/digital tempat uang disimpan.</span></div></div>
    <div className="tabPro"><button className={tab==='funds'?'active':''} onClick={()=>setTab('funds')}>Dana Amanah <Badge>{d.funds.length}</Badge></button><button className={tab==='cash'?'active':''} onClick={()=>setTab('cash')}>Kas & Rekening <Badge>{d.cash.length}</Badge></button></div>
    <div className="entityGrid">{rows.map(x=><article className="entityCard" key={x.id}>
      <div className="entityTop"><div className={'entityIcon '+(tab==='funds'?(x.restricted?'amber':'purple'):'blue')}>{tab==='funds'?(x.restricted?<I.LockKeyhole/>:<I.Wallet/>):(x.kind==='bank'?<I.Landmark/>:x.kind==='ewallet'?<I.Smartphone/>:<I.Banknote/>)}</div><div><b>{x.name}</b><span>{tab==='funds'?(x.restricted?'Dana Terikat':'Dana Bebas'):(x.kind==='bank'?'Bank':x.kind==='ewallet'?'E-Wallet':x.kind==='cash'?'Tunai':'Lainnya')}</span></div>{perms.finance&&<button className="iconBtn small" onClick={()=>open({type:tab==='funds'?'fund':'cash',item:(m[tab==='funds'?'funds':'cash']||[]).find(y=>y.id===x.id)})}><I.Pencil/></button>}</div>
      <strong>{rp(x.balance)}</strong><small className="muted">Saldo berjalan</small>
      {tab==='funds'&&x.restricted&&<div className="miniNotice"><I.Info/>Penggunaan mengikuti aturan dana terikat.</div>}
    </article>)}</div>
  </>
}

function Boxes({m,perms,open,reload,notify}){
  const sessions=m.boxes||[];
  const total=sessions.reduce((s,x)=>s+boxTotal(x),0);
  const posted=sessions.filter(x=>x.posted_transaction_id).length;
  const doPost=async x=>{try{await postDonationBox(x.id);notify('Kotak amal berhasil dicatat sebagai pemasukan');reload()}catch(e){notify(e.message)}};
  return <>
    <PageHead eyebrow="KOTAK AMAL" title="Penghitungan & Berita Acara" text="Setiap penghitungan disimpan per titik, dua saksi, lalu diposting sekali sebagai pemasukan." action={perms.finance?<Button variant="primary" onClick={()=>open({type:'box'})}><I.Plus/>Hitung Kotak Amal</Button>:null}/>
    <div className="metricGrid three"><Metric icon={I.Coins} title="Total terhitung" value={rp(total)} meta={sessions.length+' sesi'}/><Metric icon={I.CircleCheck} title="Sudah diposting" value={String(posted)} meta="Masuk ke transaksi"/><Metric icon={I.Clock3} title="Belum diposting" value={String(sessions.length-posted)} meta="Perlu ditindaklanjuti"/></div>
    <section className="cardPro noPad">{!sessions.length?<Empty icon={I.Box} title="Belum ada penghitungan" text="Mulai sesi penghitungan kotak amal dengan dua saksi."/>:<div className="boxList">{sessions.map(x=><div className="boxRow" key={x.id}><div className="boxDate"><I.Box/><div><b>{fmtDate(x.counted_on)}</b><span>{x.counts?.length||0} titik kotak</span></div></div><div className="boxWitness"><span>Saksi</span><b>{x.witness_1} & {x.witness_2}</b></div><strong>{rp(boxTotal(x))}</strong>{x.posted_transaction_id?<Badge tone="success">Sudah diposting</Badge>:<Badge tone="warning">Belum diposting</Badge>}{perms.finance&&!x.posted_transaction_id&&<Button variant="soft" onClick={()=>doPost(x)}>Posting</Button>}</div>)}</div>}</section>
  </>
}

function Donors({m,perms,open}){
  const rows=m.donors||[];const totalCommit=rows.filter(x=>x.active).reduce((s,x)=>s+num(x.monthly_commitment),0);
  return <>
    <PageHead eyebrow="RELASI DONATUR" title="Donatur" text="Komitmen bulanan hanya target dan tidak menambah saldo sebelum transaksi benar-benar diterima." action={perms.manage?<div className="headActions"><Button onClick={()=>open({type:'import-excel',entity:'donor'})}><I.FileSpreadsheet/>Import Excel</Button><Button variant="primary" onClick={()=>open({type:'donor'})}><I.Plus/>Tambah Donatur</Button></div>:null}/>
    <div className="metricGrid three"><Metric icon={I.Users} title="Donatur aktif" value={String(rows.filter(x=>x.active).length)} meta="Terdaftar"/><Metric icon={I.CalendarHeart} title="Komitmen bulanan" value={rp(totalCommit)} meta="Target, bukan kas"/><Metric icon={I.UserX} title="Nonaktif" value={String(rows.filter(x=>!x.active).length)} meta="Histori tetap disimpan"/></div>
    <div className="entityGrid">{rows.map(x=><article className="entityCard" key={x.id}><div className="entityTop"><div className="entityIcon blue"><I.UserRound/></div><div><b>{x.name}</b><span>{x.phone||'Nomor HP belum diisi'}</span></div>{perms.manage&&<button className="iconBtn small" onClick={()=>open({type:'donor',item:x})}><I.Pencil/></button>}</div><div className="entityMeta"><span><b>{rp(x.monthly_commitment)}</b>Komitmen/bln</span><span><b>{x.active?'Aktif':'Nonaktif'}</b>Status</span></div>{x.address&&<p className="muted">{x.address}</p>}</article>)}</div>
    {!rows.length&&<section className="cardPro"><Empty icon={I.HandHeart} title="Belum ada donatur" text="Tambahkan donatur tetap atau donatur yang ingin dicatat riwayat kontribusinya."/></section>}
  </>
}

function Units({m,d,perms,open}){
  const rows=m.units||[];const posted=d.transactions.filter(x=>x.status==='posted');
  return <>
    <PageHead eyebrow="UNIT & USAHA" title="Unit Masjid" text="Pantau pemasukan dan biaya TPQ, aula, parkir, koperasi, ambulans, dan unit lainnya." action={perms.manage?<div className="headActions"><Button onClick={()=>open({type:'import-excel',entity:'unit'})}><I.FileSpreadsheet/>Import Excel</Button><Button variant="primary" onClick={()=>open({type:'unit'})}><I.Plus/>Tambah Unit</Button></div>:null}/>
    <div className="entityGrid">{rows.map(x=>{const tx=posted.filter(t=>t.unit_id===x.id),inc=tx.filter(t=>t.kind==='income').reduce((s,t)=>s+num(t.amount),0),out=tx.filter(t=>t.kind==='expense').reduce((s,t)=>s+num(t.amount),0);return <article className="entityCard" key={x.id}><div className="entityTop"><div className="entityIcon purple"><I.Store/></div><div><b>{x.name}</b><span>{x.person_in_charge||'PIC belum ditetapkan'}</span></div>{perms.manage&&<button className="iconBtn small" onClick={()=>open({type:'unit',item:x})}><I.Pencil/></button>}</div><div className="entityMeta"><span><b className="moneyIn">{rp(inc)}</b>Masuk</span><span><b className="moneyOut">{rp(out)}</b>Keluar</span><span><b>{rp(inc-out)}</b>Hasil</span></div></article>})}</div>
    {!rows.length&&<section className="cardPro"><Empty icon={I.Store} title="Belum ada unit masjid" text="Unit bersifat opsional. Tambahkan jika masjid memiliki TPQ, aula, koperasi, parkir, atau layanan lainnya."/></section>}
  </>
}

function Budgets({m,d,perms,open}){
  const rows=budgetRealization(m.budgets,d.transactions.filter(x=>x.status==='posted'));
  const total=rows.reduce((s,x)=>s+num(x.amount),0),real=rows.reduce((s,x)=>s+x.realized,0);
  return <>
    <PageHead eyebrow="KONTROL BELANJA" title="Anggaran" text="Anggaran adalah batas belanja, bukan saldo Dana." action={perms.finance?<div className="headActions"><Button onClick={()=>open({type:'import-excel',entity:'budget'})}><I.FileSpreadsheet/>Import Excel</Button><Button variant="primary" onClick={()=>open({type:'budget'})}><I.Plus/>Buat Anggaran</Button></div>:null}/>
    <div className="metricGrid three"><Metric icon={I.Target} title="Total pagu" value={rp(total)} meta="Periode aktif"/><Metric icon={I.Receipt} title="Realisasi" value={rp(real)} meta={total?Math.round(real/total*100)+'% dari pagu':'Belum ada pagu'}/><Metric icon={I.PiggyBank} title="Sisa anggaran" value={rp(total-real)} meta="Pagu dikurangi realisasi"/></div>
    <section className="cardPro"><SectionHead title="Realisasi per bidang" text="Pengeluaran POSTED dikelompokkan berdasarkan bidang anggaran."/>
      {!rows.length?<Empty icon={I.PieChart} title="Belum ada anggaran" text="Buat pagu untuk bidang operasional, pendidikan, sosial, kegiatan, dan lainnya."/>:<div className="budgetList">{rows.map(x=><div className="budgetRow" key={x.id}><div className="budgetTitle"><div><b>{x.name}</b><span>{x.budget_group}</span></div>{perms.finance&&<button className="iconBtn small" onClick={()=>open({type:'budget',item:x})}><I.Pencil/></button>}</div><div className="budgetNumbers"><strong>{rp(x.realized)}</strong><span>dari {rp(x.amount)} • {Math.round(x.percent)}%</span></div><div className="progressPro"><i style={{width:Math.min(100,x.percent)+'%'}} className={x.percent>=100?'danger':x.percent>=80?'warning':''}/></div><Badge tone={x.percent>=100?'danger':x.percent>=80?'warning':'success'}>{x.percent>=100?'Melebihi pagu':x.percent>=80?'Hampir habis':'Terkendali'}</Badge></div>)}</div>}
    </section>
  </>
}

function Inventory({m,perms,open}){
  const rows=m.inventory||[];const total=rows.reduce((s,x)=>s+num(x.quantity)*num(x.unit_value),0);
  return <>
    <PageHead eyebrow="ASET MASJID" title="Inventaris" text="Simpan nilai, lokasi, kondisi, sumber dana, dan catatan aset agar serah terima pengurus lebih rapi." action={perms.manage?<div className="headActions"><Button onClick={()=>open({type:'import-excel',entity:'inventory'})}><I.FileSpreadsheet/>Import Excel</Button><Button variant="primary" onClick={()=>open({type:'inventory'})}><I.Plus/>Tambah Aset</Button></div>:null}/>
    <div className="metricGrid three"><Metric icon={I.PackageCheck} title="Total item" value={String(rows.reduce((s,x)=>s+num(x.quantity),0))} meta={rows.length+' jenis aset'}/><Metric icon={I.BadgeDollarSign} title="Nilai aset" value={rp(total)} meta="Berdasarkan nilai perolehan"/><Metric icon={I.Wrench} title="Perlu perhatian" value={String(rows.filter(x=>x.condition!=='good').length)} meta="Servis / rusak"/></div>
    <section className="cardPro noPad">{!rows.length?<Empty icon={I.Package} title="Belum ada inventaris" text="Tambahkan aset masjid, lokasi, kondisi, nilai, dan sumber dananya."/>:<div className="assetGrid">{rows.map(x=><button className="assetRow" key={x.id} onClick={()=>perms.manage&&open({type:'inventory',item:x})}><div className={'assetIcon '+(x.condition==='good'?'good':x.condition==='service'?'warn':'bad')}><I.Package/></div><div><b>{x.name}</b><span>{x.code} • {x.location||'Lokasi belum diisi'}</span></div><div><strong>{num(x.quantity)} {x.unit||'unit'}</strong><span>{rp(num(x.quantity)*num(x.unit_value))}</span></div><Badge tone={x.condition==='good'?'success':x.condition==='service'?'warning':'danger'}>{x.condition==='good'?'Baik':x.condition==='service'?'Perlu servis':x.condition==='damaged'?'Rusak':x.condition}</Badge></button>)}</div>}</section>
  </>
}

function Reports({d,mosque}){
  const[start,setStart]=useState(()=>{const x=new Date();x.setDate(1);return x.toISOString().slice(0,10)});
  const[end,setEnd]=useState(today()),[kind,setKind]=useState('all');
  const rows=useMemo(()=>d.transactions.filter(x=>x.status==='posted'&&x.tx_date>=start&&x.tx_date<=end&&(kind==='all'||x.kind===kind)),[d.transactions,start,end,kind]);
  const income=rows.filter(x=>x.kind==='income').reduce((s,x)=>s+num(x.amount),0);
  const expense=rows.filter(x=>x.kind==='expense').reduce((s,x)=>s+num(x.amount),0);
  const exportCsv=()=>download('laporan-amanah-pro.csv',toCsv(rows),'text/csv;charset=utf-8');
  const exportDoc=()=>download('laporan-amanah-pro.doc',reportHtml(mosque,start,end,rows,income,expense),'application/msword');
  return <>
    <PageHead eyebrow="PUSAT LAPORAN" title="Laporan Keuangan" text="Pilih rentang tanggal bebas, preview data, lalu ekspor untuk pertanggungjawaban."/>
    <section className="cardPro reportFilter"><div className="formGrid3"><label>Mulai<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Selesai<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label><label>Jenis<select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">Semua transaksi</option><option value="income">Pemasukan</option><option value="expense">Pengeluaran</option><option value="transfer">Transfer kas</option></select></label></div><div className="exportBtns"><Button onClick={exportCsv}><I.FileSpreadsheet/>Excel / CSV</Button><Button onClick={exportDoc}><I.FileType2/>Word</Button><Button variant="primary" onClick={()=>printCleanReport(mosque,start,end,rows,income,expense)}><I.FileDown/>PDF / Cetak</Button></div></section>
    <div className="metricGrid three"><Metric icon={I.ArrowDownLeft} title="Pemasukan" value={rp(income)} tone="green"/><Metric icon={I.ArrowUpRight} title="Pengeluaran" value={rp(expense)} tone="red"/><Metric icon={I.Scale} title="Surplus / Defisit" value={rp(income-expense)} tone={income-expense>=0?'purple':'red'}/></div>
    <section className="cardPro reportPaper"><div className="reportHeader"><div><Logo compact/><h2>{mosque?.name}</h2><p>Laporan Keuangan • {fmtDate(start)} — {fmtDate(end)}</p></div><div><span>Dibuat</span><b>{fmtDate(today())}</b></div></div><TransactionRows rows={rows}/></section>
  </>
}

function Approvals({m,perms,open}){
  const rows=m.approvals||[];
  return <>
    <PageHead eyebrow="KONTROL TRANSAKSI" title="Persetujuan" text="Periksa nominal, dampak, dan bukti sebelum transaksi dilanjutkan."/>
    <div className="metricGrid three"><Metric icon={I.Clock3} title="Menunggu" value={String(rows.filter(x=>x.status==='pending').length)} meta="Perlu keputusan"/><Metric icon={I.CircleCheck} title="Disetujui" value={String(rows.filter(x=>x.status==='approved').length)} meta="Sudah ditangani"/><Metric icon={I.CircleX} title="Ditolak" value={String(rows.filter(x=>x.status==='rejected').length)} meta="Tidak diposting"/></div>
    <section className="cardPro noPad">{!rows.length?<Empty icon={I.ShieldCheck} title="Tidak ada persetujuan" text="Jika aturan approval aktif, transaksi yang perlu keputusan akan muncul di sini."/>:<div className="approvalList">{rows.map(a=><div className="approvalRow" key={a.id}><div className="approvalInfo"><div className="miniIcon purple"><I.ReceiptText/></div><div><b>{a.transactions?.description||'Transaksi'}</b><span>{a.transactions?.document_no} • {fmtDate(a.transactions?.tx_date)}</span></div></div><strong>{rp(a.transactions?.amount)}</strong><Badge tone={a.status==='pending'?'warning':a.status==='approved'?'success':'danger'}>{statusLabel[a.status]||a.status}</Badge>{perms.approve&&a.status==='pending'&&<div className="approvalBtns"><Button onClick={()=>open({type:'approval',item:a,decision:'rejected'})}>Tolak</Button><Button variant="primary" onClick={()=>open({type:'approval',item:a,decision:'approved'})}>Setujui</Button></div>}</div>)}</div>}</section>
  </>
}

function Notifications({d,mosque,reload,go,notify}){
  const rows=d.notifications||[],unread=rows.filter(x=>!x.read_at).length;
  const read=async n=>{try{if(!n.read_at)await markNotificationRead(n.id);if(n.link&&n.link.startsWith('#'))go(n.link.slice(1));reload()}catch(e){notify(e.message)}};
  const readAll=async()=>{try{await markAllNotificationsRead(mosque.id);notify('Semua notifikasi ditandai sudah dibaca');reload()}catch(e){notify(e.message)}};
  return <>
    <PageHead eyebrow="PUSAT PEMBERITAHUAN" title="Notifikasi" text="Peringatan transaksi, approval, pembatalan, dan aktivitas penting muncul otomatis." action={unread?<Button onClick={readAll}><I.CheckCheck/>Tandai semua dibaca</Button>:null}/>
    <div className="notificationSummary"><div><I.BellRing/><span>Belum dibaca</span><strong>{unread}</strong></div><div><I.Inbox/><span>Total notifikasi</span><strong>{rows.length}</strong></div></div>
    <section className="cardPro noPad">{!rows.length?<Empty icon={I.BellOff} title="Belum ada notifikasi" text="Notifikasi akan dibuat otomatis saat transaksi menunggu persetujuan, tercatat, ditolak, atau dibatalkan."/>:<div className="noticeList">{rows.map(n=><button className={'noticePro '+(!n.read_at?'unread':'')} key={n.id} onClick={()=>read(n)}><div className={'noticeIcon '+(n.severity||'info')}>{n.severity==='warning'?<I.TriangleAlert/>:n.severity==='critical'?<I.CircleAlert/>:<I.Bell/>}</div><div><b>{n.title}</b><p>{n.body}</p><span>{fmtTime(n.created_at)}</span></div>{!n.read_at&&<i/>}</button>)}</div>}</section>
  </>
}

function Team({m,perms,open,reload,notify}){
  const rows=m.members||[];
  const deactivate=async x=>{if(!confirm('Nonaktifkan akses anggota ini? Riwayat tetap disimpan.'))return;try{await updateRecord('memberships',x.id,{active:false});notify('Akses anggota dinonaktifkan');reload()}catch(e){notify(e.message)}};
  return <>
    <PageHead eyebrow="TIM PENGELOLA" title="Tim & Hak Akses" text="Role menentukan batas tindakan. Data keuangan tetap terisolasi per masjid." action={perms.team?<Button variant="primary" onClick={()=>open({type:'member'})}><I.UserPlus/>Tambah Anggota</Button>:null}/>
    <section className="cardPro noPad">{rows.map(x=><div className="memberRow" key={x.id}><div className="avatarPro">{(x.profiles?.full_name||'PG').slice(0,2).toUpperCase()}</div><div><b>{x.profiles?.full_name||'Pengurus'}</b><span>{roleLabel[x.role]||x.role}</span></div><Badge tone={x.active?'success':''}>{x.active?'Aktif':'Nonaktif'}</Badge>{perms.team&&x.role!=='owner'&&x.active&&<button className="iconBtn small dangerText" onClick={()=>deactivate(x)} title="Nonaktifkan"><I.UserX/></button>}</div>)}</section>
  </>
}

function Settings({m,mosque,perms,reload,notify,open}){
  const[tab,setTab]=useState('profile');
  const[profileForm,setProfileForm]=useState({name:mosque?.name||'',city:mosque?.city||'',address:mosque?.address||'',simas_no:mosque?.simas_no||'',contact:mosque?.contact||'',donation_account:mosque?.donation_account||''});
  const[s,setS]=useState({approval_enabled:!!m.settings?.approval_enabled,approval_threshold:m.settings?.approval_threshold||'',require_evidence_threshold:m.settings?.require_evidence_threshold||'',four_eyes:!!m.settings?.four_eyes});
  const saveProfile=async()=>{try{await updateRecord('mosques',mosque.id,profileForm);notify('Profil masjid diperbarui');reload()}catch(e){notify(e.message)}};
  const savePolicy=async()=>{try{await upsertRecord('settings',{mosque_id:mosque.id,approval_enabled:s.approval_enabled,approval_threshold:s.approval_threshold===''?null:Number(s.approval_threshold),require_evidence_threshold:s.require_evidence_threshold===''?null:Number(s.require_evidence_threshold),four_eyes:s.four_eyes,preferences:m.settings?.preferences||{}},'mosque_id');notify('Kebijakan keuangan disimpan');reload()}catch(e){notify(e.message)}};
  return <>
    <PageHead eyebrow="KONFIGURASI" title="Pengaturan" text="Atur identitas masjid, kebijakan transaksi, kategori, dan lihat jejak audit."/>
    <div className="tabPro settingTabs"><button className={tab==='profile'?'active':''} onClick={()=>setTab('profile')}>Profil Masjid</button><button className={tab==='policy'?'active':''} onClick={()=>setTab('policy')}>Kebijakan</button><button className={tab==='category'?'active':''} onClick={()=>setTab('category')}>Kategori</button><button className={tab==='audit'?'active':''} onClick={()=>setTab('audit')}>Audit Trail</button></div>

    {tab==='profile'&&<section className="cardPro settingsForm"><SectionHead title="Identitas Masjid" text="Digunakan pada laporan dan header aplikasi."/><div className="formGrid2"><label>Nama Masjid<input value={profileForm.name} onChange={e=>setProfileForm({...profileForm,name:e.target.value})}/></label><label>Kota / Kabupaten<input value={profileForm.city} onChange={e=>setProfileForm({...profileForm,city:e.target.value})}/></label><label className="span2">Alamat<textarea value={profileForm.address} onChange={e=>setProfileForm({...profileForm,address:e.target.value})}/></label><label>No. SIMAS<input value={profileForm.simas_no} onChange={e=>setProfileForm({...profileForm,simas_no:e.target.value})}/></label><label>Kontak<input value={profileForm.contact} onChange={e=>setProfileForm({...profileForm,contact:e.target.value})}/></label><label className="span2">Rekening Donasi<input value={profileForm.donation_account} onChange={e=>setProfileForm({...profileForm,donation_account:e.target.value})}/></label></div>{perms.manage&&<div className="saveBar"><Button variant="primary" onClick={saveProfile}>Simpan Perubahan</Button></div>}</section>}

    {tab==='policy'&&<section className="cardPro settingsForm"><SectionHead title="Kebijakan Transaksi" text="Kontrol ini berlaku untuk transaksi baru."/><div className="toggleList"><label className="toggleRow"><div><b>Aktifkan approval transaksi</b><span>Transaksi yang memenuhi aturan menunggu persetujuan sebelum POSTED.</span></div><input type="checkbox" checked={s.approval_enabled} onChange={e=>setS({...s,approval_enabled:e.target.checked})}/></label><label className="toggleRow"><div><b>Four-eyes approval</b><span>Pembuat transaksi dan penyetuju harus berbeda.</span></div><input type="checkbox" checked={s.four_eyes} onChange={e=>setS({...s,four_eyes:e.target.checked})}/></label></div><div className="formGrid2"><label>Ambang approval<input type="number" min="0" value={s.approval_threshold} onChange={e=>setS({...s,approval_threshold:e.target.value})} placeholder="Contoh 5000000"/></label><label>Bukti transaksi wajib mulai<input type="number" min="0" value={s.require_evidence_threshold} onChange={e=>setS({...s,require_evidence_threshold:e.target.value})} placeholder="Contoh 1000000"/></label></div>{perms.finance&&<div className="saveBar"><Button variant="primary" onClick={savePolicy}>Simpan Kebijakan</Button></div>}</section>}

    {tab==='category'&&<section className="cardPro"><SectionHead title="Kategori Transaksi" text="Kategori membantu laporan dan realisasi anggaran." action={perms.finance?<div className="headActions"><Button onClick={()=>open({type:'import-excel',entity:'category'})}><I.FileSpreadsheet/>Import Excel</Button><Button variant="primary" onClick={()=>open({type:'category'})}><I.Plus/>Kategori</Button></div>:null}/><div className="categoryGrid">{m.categories.map(x=><div className="categoryCard" key={x.id}><div className={'miniIcon '+(x.kind==='income'?'green':'red')}>{x.kind==='income'?<I.ArrowDownLeft/>:<I.ArrowUpRight/>}</div><div><b>{x.name}</b><span>{x.code} • {x.kind==='income'?'Pemasukan':'Pengeluaran'}</span>{x.budget_group&&<small>{x.budget_group}</small>}</div>{perms.finance&&<button className="iconBtn small" onClick={()=>open({type:'category',item:x})}><I.Pencil/></button>}</div>)}</div></section>}

    {tab==='audit'&&<section className="cardPro"><SectionHead title="Audit Trail" text="Jejak tindakan penting tidak dapat diedit oleh pengguna biasa."/><div className="auditList">{(m.audits||[]).length?(m.audits||[]).map(x=><div className="auditRow" key={x.id}><div className="auditDot"/><div><b>{x.action} • {x.entity_type}</b><span>{fmtTime(x.created_at)}{x.reason?' • '+x.reason:''}</span></div></div>):<Empty icon={I.History} title="Belum ada audit" text="Aktivitas penting akan tercatat otomatis."/ >}</div></section>}
  </>
}

function ActionRouter({action,close,...ctx}){
  if(action.type==='import-excel')return <ImportExcelModal close={close} action={action} {...ctx}/>;
  if(action.type==='transaction')return <TransactionModal close={close} action={action} {...ctx}/>;
  if(action.type==='tx-detail')return <TransactionDetail close={close} action={action} {...ctx}/>;
  if(action.type==='box')return <BoxModal close={close} {...ctx}/>;
  if(action.type==='approval')return <ApprovalModal close={close} action={action} {...ctx}/>;
  if(action.type==='member')return <MemberModal close={close} {...ctx}/>;
  return <EntityModal close={close} action={action} {...ctx}/>
}

function TransactionModal({close,action,session,d,m,mosque,reload,notify}){
  const period=d.periods.find(x=>x.status==='open');
  const[f,setF]=useState({kind:action.preset||'income',amount:'',description:'',fund_id:'',cash_account_id:'',to_cash_account_id:'',category_id:'',tx_date:today(),donor_id:'',unit_id:'',counterparty:''});
  const[alloc,setAlloc]=useState([{fund_id:'',amount:''}]),[file,setFile]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
  const cats=m.categories.filter(x=>x.kind===f.kind&&x.active);
  const selectedFund=d.funds.find(x=>x.id===f.fund_id),selectedCash=d.cash.find(x=>x.id===f.cash_account_id);
  const afterFund=selectedFund?num(selectedFund.balance)+(f.kind==='income'?num(f.amount):f.kind==='expense'?-num(f.amount):0):null;
  const afterCash=selectedCash?num(selectedCash.balance)+(f.kind==='income'?num(f.amount):f.kind==='expense'?-num(f.amount):f.kind==='transfer'?-num(f.amount):0):null;
  const allocationTotal=alloc.reduce((s,x)=>s+num(x.amount),0);
  const addAlloc=()=>setAlloc([...alloc,{fund_id:'',amount:''}]);
  const submit=async e=>{
    e.preventDefault();setBusy(true);setErr('');
    try{
      if(!period)throw Error('Tidak ada periode terbuka.');
      if(num(f.amount)<=0)throw Error('Nominal harus lebih dari Rp0.');
      if(f.kind!=='transfer'&&!f.fund_id)throw Error('Pilih Dana yang digunakan.');
      if(!f.cash_account_id)throw Error('Pilih Kas/Rekening.');
      if(f.kind==='transfer'){
        if(!f.to_cash_account_id)throw Error('Pilih Kas tujuan.');
        if(f.cash_account_id===f.to_cash_account_id)throw Error('Kas asal dan tujuan harus berbeda.');
        if(allocationTotal!==num(f.amount))throw Error('Total alokasi Dana harus sama dengan nominal transfer.');
        if(alloc.some(x=>!x.fund_id||num(x.amount)<=0))throw Error('Lengkapi seluruh alokasi Dana transfer.');
      }
      if(f.kind==='expense'&&afterFund<0)throw Error('Saldo Dana tidak mencukupi.');
      if((f.kind==='expense'||f.kind==='transfer')&&afterCash<0)throw Error('Saldo Kas/Rekening tidak mencukupi.');
      let evidence_path=null;if(file)evidence_path=await uploadEvidence(mosque.id,file);
      const payload={
        mosque_id:mosque.id,period_id:period.id,
        document_no:`${f.kind==='income'?'BKM':f.kind==='expense'?'BKK':'TRF'}-${Date.now()}`,
        kind:f.kind,tx_date:f.tx_date,amount:num(f.amount),description:f.description,
        category_id:f.kind==='transfer'?null:f.category_id||null,
        fund_id:f.kind==='transfer'?null:f.fund_id||null,
        cash_account_id:f.cash_account_id||null,
        to_cash_account_id:f.kind==='transfer'?f.to_cash_account_id:null,
        donor_id:f.kind==='income'?f.donor_id||null:null,
        unit_id:f.unit_id||null,
        counterparty:f.counterparty||null,
        evidence_path,transfer_fee:0,created_by:session.user.id
      };
      const allocations=f.kind==='transfer'?alloc.map(x=>({fund_id:x.fund_id,amount:num(x.amount)})):[];
      const tx=await createTransaction(payload,allocations);
      await postTransaction(tx.id);
      notify('Transaksi berhasil diproses');reload();close();
    }catch(x){setErr(x.message)}finally{setBusy(false)}
  };
  return <Modal title="Catat Transaksi" text="Periksa dampak saldo sebelum menyimpan." close={close} size="lg">
    <form onSubmit={submit}>
      {err&&<div className="inlineAlert danger"><I.CircleAlert/>{err}</div>}
      <div className="typeCards">{[['income',I.ArrowDownLeft,'Pemasukan'],['expense',I.ArrowUpRight,'Pengeluaran'],['transfer',I.ArrowLeftRight,'Transfer Kas']].map(([k,Icon,l])=><button type="button" key={k} className={f.kind===k?'active':''} onClick={()=>{setF({...f,kind:k,category_id:'',fund_id:''});setAlloc([{fund_id:'',amount:''}])}}><Icon/><b>{l}</b><span>{k==='income'?'Uang masuk ke masjid':k==='expense'?'Uang keluar dari masjid':'Pindah antar Kas'}</span></button>)}</div>
      <div className="formGrid2">
        <label>Tanggal<input type="date" value={f.tx_date} onChange={e=>setF({...f,tx_date:e.target.value})}/></label>
        <label>Nominal<div className="moneyField"><span>Rp</span><input type="number" min="1" required value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/></div></label>
        {f.kind!=='transfer'&&<label>Kategori<select required value={f.category_id} onChange={e=>{const c=m.categories.find(x=>x.id===e.target.value);setF({...f,category_id:e.target.value,fund_id:f.fund_id||c?.default_fund_id||''})}}><option value="">Pilih kategori</option>{cats.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        {f.kind!=='transfer'&&<label>Dana<select required value={f.fund_id} onChange={e=>setF({...f,fund_id:e.target.value})}><option value="">Pilih Dana</option>{m.funds.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}{x.restricted?' • Terikat':''}</option>)}</select></label>}
        <label>{f.kind==='transfer'?'Dari Kas / Rekening':'Kas / Rekening'}<select required value={f.cash_account_id} onChange={e=>setF({...f,cash_account_id:e.target.value})}><option value="">Pilih Kas</option>{m.cash.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        {f.kind==='transfer'&&<label>Ke Kas / Rekening<select required value={f.to_cash_account_id} onChange={e=>setF({...f,to_cash_account_id:e.target.value})}><option value="">Pilih tujuan</option>{m.cash.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        {f.kind==='income'&&<label>Donatur <span>(opsional)</span><select value={f.donor_id} onChange={e=>setF({...f,donor_id:e.target.value})}><option value="">Jamaah umum / anonim</option>{m.donors.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        {f.kind!=='transfer'&&<label>Unit Masjid <span>(opsional)</span><select value={f.unit_id} onChange={e=>setF({...f,unit_id:e.target.value})}><option value="">Tidak terkait unit</option>{m.units.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
      </div>
      {f.kind==='transfer'&&<div className="allocationBox"><div className="allocationHead"><div><b>Alokasi Dana yang ikut berpindah</b><span>Total harus sama dengan nominal transfer.</span></div><Button type="button" variant="soft" onClick={addAlloc}><I.Plus/>Dana</Button></div>{alloc.map((a,i)=><div className="allocationRow" key={i}><select value={a.fund_id} onChange={e=>setAlloc(alloc.map((x,j)=>j===i?{...x,fund_id:e.target.value}:x))}><option value="">Pilih Dana</option>{m.funds.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><input type="number" min="1" placeholder="Nominal" value={a.amount} onChange={e=>setAlloc(alloc.map((x,j)=>j===i?{...x,amount:e.target.value}:x))}/>{alloc.length>1&&<button type="button" className="iconBtn small" onClick={()=>setAlloc(alloc.filter((_,j)=>j!==i))}><I.X/></button>}</div>)}<div className={'allocationTotal '+(allocationTotal===num(f.amount)?'ok':'')}><span>Total alokasi</span><b>{rp(allocationTotal)} / {rp(f.amount)}</b></div></div>}
      <label>Uraian<textarea required rows="3" value={f.description} onChange={e=>setF({...f,description:e.target.value})} placeholder={f.kind==='income'?'Contoh: Infaq Jumat pekan ke-3':f.kind==='expense'?'Contoh: Pembayaran listrik bulan September':'Contoh: Setor kas tunai ke rekening bank'}/></label>
      <div className="formGrid2"><label>Pihak terkait <span>(opsional)</span><input value={f.counterparty} onChange={e=>setF({...f,counterparty:e.target.value})} placeholder="Nama penerima / pihak"/></label><label>Bukti transaksi <span>(opsional / sesuai kebijakan)</span><input type="file" accept="image/*,.pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/></label></div>
      {f.kind==='transfer'&&<div className="inlineAlert info"><I.Info/>Biaya transfer dicatat sebagai transaksi pengeluaran terpisah agar rekonsiliasi Dana dan Kas tetap benar.</div>}
      <div className="impactGrid">
        {f.kind!=='transfer'&&<div><span>Saldo Dana</span><b>{selectedFund?rp(selectedFund.balance):'—'}</b><I.ArrowRight/><strong className={afterFund<0?'moneyOut':''}>{afterFund==null?'—':rp(afterFund)}</strong></div>}
        <div><span>Saldo Kas</span><b>{selectedCash?rp(selectedCash.balance):'—'}</b><I.ArrowRight/><strong className={afterCash<0?'moneyOut':''}>{afterCash==null?'—':rp(afterCash)}</strong></div>
      </div>
      <div className="modalFooter inner"><Button type="button" onClick={close}>Batal</Button><Button variant="primary" disabled={busy}>{busy?<><I.LoaderCircle className="spin"/>Menyimpan...</>:<>Catat & Proses <I.ArrowRight/></>}</Button></div>
    </form>
  </Modal>
}

function TransactionDetail({close,action,perms,reload,notify}){
  const t=action.item;const[reason,setReason]=useState(''),[confirmVoid,setConfirmVoid]=useState(false),[busy,setBusy]=useState(false),[url,setUrl]=useState('');
  useEffect(()=>{if(t.evidence_path)signedFileUrl(t.evidence_path).then(setUrl).catch(()=>{})},[t.evidence_path]);
  const doVoid=async()=>{if(!reason.trim())return;setBusy(true);try{await voidTransaction(t.id,reason.trim());notify('Transaksi dibatalkan dan saldo dikembalikan');reload();close()}catch(e){notify(e.message)}finally{setBusy(false)}};
  return <Modal title="Detail Transaksi" text={t.document_no} close={close} size="md">
    <div className="txHero"><div className={'txKind big '+t.kind}>{t.kind==='income'?<I.ArrowDownLeft/>:t.kind==='expense'?<I.ArrowUpRight/>:<I.ArrowLeftRight/>}</div><div><span>{kindLabel[t.kind]}</span><strong>{rp(t.amount)}</strong></div><Badge tone={t.status==='posted'?'success':t.status==='pending'?'warning':'danger'}>{statusLabel[t.status]||t.status}</Badge></div>
    <div className="detailGrid"><Detail label="Tanggal" value={fmtDate(t.tx_date)}/><Detail label="Kategori" value={t.categories?.name||'—'}/><Detail label="Dana" value={t.funds?.name||'—'}/><Detail label="Kas / Rekening" value={t.cash_accounts?.name||'—'}/>{t.kind==='transfer'&&<Detail label="Tujuan Transfer" value={t.to_cash?.name||'—'}/>}<Detail label="Pihak terkait" value={t.counterparty||t.donors?.name||'—'}/><Detail label="Unit" value={t.units?.name||'—'}/></div>
    <div className="descriptionBox"><span>Uraian</span><p>{t.description}</p></div>
    {url&&<a className="evidenceLink" href={url} target="_blank" rel="noreferrer"><I.Paperclip/>Buka bukti transaksi <I.ExternalLink/></a>}
    {t.status==='voided'&&<div className="inlineAlert danger"><I.CircleAlert/>Dibatalkan: {t.void_reason||'Tanpa alasan'}</div>}
    {perms.finance&&t.status==='posted'&&!confirmVoid&&<div className="dangerZone"><div><b>Batalkan transaksi</b><span>Saldo akan dikembalikan, tetapi histori transaksi tetap disimpan.</span></div><Button onClick={()=>setConfirmVoid(true)}>Batalkan Transaksi</Button></div>}
    {confirmVoid&&<div className="voidBox"><label>Alasan pembatalan<textarea rows="3" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Jelaskan alasan pembatalan..."/></label><div className="rowActions"><Button onClick={()=>setConfirmVoid(false)}>Kembali</Button><Button variant="danger" disabled={!reason.trim()||busy} onClick={doVoid}>{busy?'Memproses...':'Ya, Batalkan Transaksi'}</Button></div></div>}
  </Modal>
}
function Detail({label,value}){return <div className="detailItem"><span>{label}</span><b>{value}</b></div>}

function BoxModal({close,session,m,mosque,reload,notify}){
  const[f,setF]=useState({counted_on:today(),witness_1:'',witness_2:'',fund_id:'',cash_account_id:''});
  const[rows,setRows]=useState([{location:'Pintu Utama',large_notes:'',small_notes:'',coins:'',other:''}]),[busy,setBusy]=useState(false),[err,setErr]=useState('');
  const total=rows.reduce((s,x)=>s+num(x.large_notes)+num(x.small_notes)+num(x.coins)+num(x.other),0);
  const save=async()=>{setBusy(true);setErr('');try{if(!f.witness_1.trim()||!f.witness_2.trim())throw Error('Lengkapi dua saksi.');if(f.witness_1.trim().toLowerCase()===f.witness_2.trim().toLowerCase())throw Error('Saksi 1 dan Saksi 2 harus berbeda.');if(!f.fund_id||!f.cash_account_id)throw Error('Pilih Dana dan Kas tujuan.');const s=await createDonationBoxSession(mosque.id,{...f,created_by:session.user.id},rows);notify('Penghitungan tersimpan');reload();close()}catch(e){setErr(e.message)}finally{setBusy(false)}};
  return <Modal title="Hitung Kotak Amal" text="Catat tiap titik kotak dan dua saksi penghitungan." close={close} size="lg">
    {err&&<div className="inlineAlert danger"><I.CircleAlert/>{err}</div>}
    <div className="formGrid2"><label>Tanggal penghitungan<input type="date" value={f.counted_on} onChange={e=>setF({...f,counted_on:e.target.value})}/></label><label>Dana tujuan<select value={f.fund_id} onChange={e=>setF({...f,fund_id:e.target.value})}><option value="">Pilih Dana</option>{m.funds.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Saksi 1<input value={f.witness_1} onChange={e=>setF({...f,witness_1:e.target.value})} placeholder="Nama saksi pertama"/></label><label>Saksi 2<input value={f.witness_2} onChange={e=>setF({...f,witness_2:e.target.value})} placeholder="Nama saksi kedua"/></label><label className="span2">Masuk ke Kas / Rekening<select value={f.cash_account_id} onChange={e=>setF({...f,cash_account_id:e.target.value})}><option value="">Pilih Kas</option>{m.cash.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label></div>
    <div className="boxCountHead"><div><b>Rincian titik kotak</b><span>Masukkan nilai total per kelompok pecahan.</span></div><Button variant="soft" onClick={()=>setRows([...rows,{location:'',large_notes:'',small_notes:'',coins:'',other:''}])}><I.Plus/>Titik</Button></div>
    <div className="countRows">{rows.map((x,i)=><div className="countCard" key={i}><div className="countTop"><input value={x.location} onChange={e=>setRows(rows.map((r,j)=>j===i?{...r,location:e.target.value}:r))} placeholder="Lokasi kotak"/>{rows.length>1&&<button className="iconBtn small" onClick={()=>setRows(rows.filter((_,j)=>j!==i))}><I.X/></button>}</div><div className="formGrid4"><label>Pecahan besar<input type="number" min="0" value={x.large_notes} onChange={e=>setRows(rows.map((r,j)=>j===i?{...r,large_notes:e.target.value}:r))}/></label><label>Pecahan kecil<input type="number" min="0" value={x.small_notes} onChange={e=>setRows(rows.map((r,j)=>j===i?{...r,small_notes:e.target.value}:r))}/></label><label>Koin<input type="number" min="0" value={x.coins} onChange={e=>setRows(rows.map((r,j)=>j===i?{...r,coins:e.target.value}:r))}/></label><label>Lainnya<input type="number" min="0" value={x.other} onChange={e=>setRows(rows.map((r,j)=>j===i?{...r,other:e.target.value}:r))}/></label></div><strong>{rp(num(x.large_notes)+num(x.small_notes)+num(x.coins)+num(x.other))}</strong></div>)}</div>
    <div className="boxTotal"><span>Total seluruh kotak</span><strong>{rp(total)}</strong></div>
    <div className="modalFooter inner"><Button onClick={close}>Batal</Button><Button variant="primary" onClick={save} disabled={busy||total<=0}>{busy?'Menyimpan...':'Simpan Penghitungan'}</Button></div>
  </Modal>
}

function ApprovalModal({close,action,reload,notify}){
  const[note,setNote]=useState(''),[busy,setBusy]=useState(false);const a=action.item;
  const submit=async()=>{setBusy(true);try{await decideApproval(a.id,action.decision,note);notify(action.decision==='approved'?'Transaksi disetujui':'Transaksi ditolak');reload();close()}catch(e){notify(e.message)}finally{setBusy(false)}};
  return <Modal title={action.decision==='approved'?'Setujui Transaksi':'Tolak Transaksi'} text={a.transactions?.document_no} close={close}>
    <div className="decisionHero"><I.ShieldCheck/><div><span>Nominal</span><strong>{rp(a.transactions?.amount)}</strong><p>{a.transactions?.description}</p></div></div>
    <label>Catatan keputusan {action.decision==='rejected'&&<span>(disarankan diisi)</span>}<textarea rows="4" value={note} onChange={e=>setNote(e.target.value)} placeholder="Tambahkan catatan..."/></label>
    <div className="modalFooter inner"><Button onClick={close}>Batal</Button><Button variant={action.decision==='approved'?'primary':'danger'} disabled={busy} onClick={submit}>{busy?'Memproses...':action.decision==='approved'?'Setujui':'Tolak'}</Button></div>
  </Modal>
}

function MemberModal({close,mosque,reload,notify}){
  const[f,setF]=useState({email:'',role:'member'}),[busy,setBusy]=useState(false),[err,setErr]=useState('');
  const submit=async()=>{setBusy(true);setErr('');try{await addMember(mosque.id,f.email,f.role);notify('Anggota berhasil ditambahkan');reload();close()}catch(e){setErr(e.message)}finally{setBusy(false)}};
  return <Modal title="Tambah Anggota Tim" text="Pengguna harus sudah memiliki akun Amanah Pro." close={close}>
    {err&&<div className="inlineAlert danger"><I.CircleAlert/>{err}</div>}
    <label>Email akun<input type="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})} placeholder="anggota@email.com"/></label>
    <label>Role<select value={f.role} onChange={e=>setF({...f,role:e.target.value})}><option value="treasurer">Bendahara</option><option value="secretary">Sekretaris</option><option value="member">Pengurus</option><option value="viewer">Viewer</option></select></label>
    <div className="roleExplain">{f.role==='treasurer'?'Dapat mengelola transaksi dan keuangan.':f.role==='secretary'?'Dapat mengelola data administratif dan inventaris.':f.role==='member'?'Akses operasional sesuai kebijakan.':'Hanya melihat data dan laporan.'}</div>
    <div className="modalFooter inner"><Button onClick={close}>Batal</Button><Button variant="primary" disabled={!f.email||busy} onClick={submit}>{busy?'Menambahkan...':'Tambah Anggota'}</Button></div>
  </Modal>
}

function EntityModal({action,close,m,d,mosque,reload,notify}){
  const item=action.item||null,type=action.type,[busy,setBusy]=useState(false),[err,setErr]=useState('');
  const openPeriod=d.periods.find(x=>x.status==='open');
  const defaults={
    fund:{name:'',restricted:false,usage_rule:'',active:true},
    cash:{name:'',kind:'cash',active:true},
    category:{kind:'income',name:'',budget_group:'',default_fund_id:'',active:true},
    donor:{code:'',name:'',phone:'',address:'',monthly_commitment:'',preferred_fund_id:'',active:true},
    unit:{code:'',name:'',person_in_charge:'',active:true},
    budget:{code:'',name:'',budget_group:'Operasional Masjid',amount:''},
    inventory:{code:'',name:'',location:'',quantity:1,unit:'unit',unit_value:'',acquired_on:today(),fund_id:'',condition:'good',notes:''}
  };
  const[f,setF]=useState({...defaults[type],...(item||{})});
  const title={fund:'Dana Amanah',cash:'Kas / Rekening',category:'Kategori Transaksi',donor:'Donatur',unit:'Unit Masjid',budget:'Anggaran',inventory:'Inventaris'}[type]||'Data';
  const save=async()=>{
    setBusy(true);setErr('');
    try{
      let payload={...f,mosque_id:mosque.id};
      if(type==='fund'){payload={mosque_id:mosque.id,code:item?.code||'DANA-'+Date.now().toString().slice(-5),name:f.name,restricted:!!f.restricted,usage_rule:f.usage_rule||null,opening_balance:item?.opening_balance||0,active:!!f.active}}
      if(type==='cash'){payload={mosque_id:mosque.id,code:item?.code||'KAS-'+Date.now().toString().slice(-5),name:f.name,kind:f.kind,opening_balance:item?.opening_balance||0,active:!!f.active}}
      if(type==='category'){payload={mosque_id:mosque.id,kind:f.kind,code:item?.code||((f.kind==='income'?'PM-':'PK-')+Date.now().toString().slice(-5)),name:f.name,budget_group:f.kind==='expense'?f.budget_group||null:null,default_fund_id:f.default_fund_id||null,active:!!f.active}}
      if(type==='donor'){payload={mosque_id:mosque.id,code:f.code||null,name:f.name,phone:f.phone||null,address:f.address||null,monthly_commitment:f.monthly_commitment===''?null:num(f.monthly_commitment),preferred_fund_id:f.preferred_fund_id||null,active:!!f.active}}
      if(type==='unit'){payload={mosque_id:mosque.id,code:f.code||('UNIT-'+Date.now().toString().slice(-5)),name:f.name,person_in_charge:f.person_in_charge||null,active:!!f.active}}
      if(type==='budget'){if(!openPeriod)throw Error('Tidak ada periode aktif.');payload={mosque_id:mosque.id,period_id:item?.period_id||openPeriod.id,code:f.code||('ANG-'+Date.now().toString().slice(-5)),name:f.name,budget_group:f.budget_group,amount:num(f.amount)}}
      if(type==='inventory'){payload={mosque_id:mosque.id,code:f.code||('INV-'+Date.now().toString().slice(-5)),name:f.name,location:f.location||null,quantity:num(f.quantity)||1,unit:f.unit||null,unit_value:num(f.unit_value),acquired_on:f.acquired_on||null,fund_id:f.fund_id||null,condition:f.condition,notes:f.notes||null}}
      if(item?.id)await updateRecord(type==='cash'?'cash_accounts':type==='category'?'categories':type==='donor'?'donors':type==='unit'?'units':type==='budget'?'budgets':type==='inventory'?'inventory':'funds',item.id,payload);
      else await createRecord(type==='cash'?'cash_accounts':type==='category'?'categories':type==='donor'?'donors':type==='unit'?'units':type==='budget'?'budgets':type==='inventory'?'inventory':'funds',payload);
      notify(title+' berhasil disimpan');reload();close();
    }catch(e){setErr(e.message)}finally{setBusy(false)}
  };
  return <Modal title={(item?'Edit ':'Tambah ')+title} text={item?'Perbarui data tanpa menghapus histori lama.':'Lengkapi informasi agar data siap digunakan.'} close={close} size={['inventory','donor'].includes(type)?'lg':'md'}>
    {err&&<div className="inlineAlert danger"><I.CircleAlert/>{err}</div>}
    {type==='fund'&&<><label>Nama Dana<input value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="Contoh: Dana Pembangunan"/></label><label className="toggleRow compact"><div><b>Dana Terikat</b><span>Aktifkan jika penggunaannya memiliki peruntukan khusus.</span></div><input type="checkbox" checked={!!f.restricted} onChange={e=>setF({...f,restricted:e.target.checked})}/></label>{f.restricted&&<label>Aturan / Peruntukan<textarea rows="3" value={f.usage_rule||''} onChange={e=>setF({...f,usage_rule:e.target.value})} placeholder="Contoh: Hanya untuk pembangunan dan renovasi masjid"/></label>}<label className="toggleRow compact"><div><b>Aktif</b><span>Master lama sebaiknya dinonaktifkan, bukan dihapus.</span></div><input type="checkbox" checked={!!f.active} onChange={e=>setF({...f,active:e.target.checked})}/></label></>}
    {type==='cash'&&<><label>Nama Kas / Rekening<input value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="Contoh: Bank BSI Utama"/></label><label>Jenis<select value={f.kind} onChange={e=>setF({...f,kind:e.target.value})}><option value="cash">Tunai</option><option value="bank">Bank / Rekening</option><option value="ewallet">E-Wallet</option><option value="other">Lainnya</option></select></label><label className="toggleRow compact"><div><b>Aktif</b><span>Nonaktifkan bila rekening sudah tidak dipakai.</span></div><input type="checkbox" checked={!!f.active} onChange={e=>setF({...f,active:e.target.checked})}/></label></>}
    {type==='category'&&<><div className="formGrid2"><label>Jenis<select value={f.kind} onChange={e=>setF({...f,kind:e.target.value})}><option value="income">Pemasukan</option><option value="expense">Pengeluaran</option></select></label><label>Nama kategori<input value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="Contoh: Listrik, Air & Internet"/></label></div>{f.kind==='expense'&&<label>Kelompok anggaran<input value={f.budget_group||''} onChange={e=>setF({...f,budget_group:e.target.value})} placeholder="Contoh: Operasional Masjid"/></label>}<label>Dana default <span>(opsional)</span><select value={f.default_fund_id||''} onChange={e=>setF({...f,default_fund_id:e.target.value})}><option value="">Tidak ada default</option>{m.funds.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label className="toggleRow compact"><div><b>Aktif</b><span>Kategori lama dapat dinonaktifkan tanpa menghapus histori.</span></div><input type="checkbox" checked={!!f.active} onChange={e=>setF({...f,active:e.target.checked})}/></label></>}
    {type==='donor'&&<><div className="formGrid2"><label>Nama donatur<input value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></label><label>Kode <span>(opsional)</span><input value={f.code||''} onChange={e=>setF({...f,code:e.target.value})}/></label><label>No. HP<input value={f.phone||''} onChange={e=>setF({...f,phone:e.target.value})}/></label><label>Komitmen bulanan<input type="number" min="0" value={f.monthly_commitment||''} onChange={e=>setF({...f,monthly_commitment:e.target.value})}/></label><label className="span2">Alamat<textarea rows="2" value={f.address||''} onChange={e=>setF({...f,address:e.target.value})}/></label><label>Dana yang biasa didukung<select value={f.preferred_fund_id||''} onChange={e=>setF({...f,preferred_fund_id:e.target.value})}><option value="">Tidak ditentukan</option>{m.funds.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label className="toggleRow compact"><div><b>Aktif</b><span>Simpan histori saat donatur berhenti.</span></div><input type="checkbox" checked={!!f.active} onChange={e=>setF({...f,active:e.target.checked})}/></label></div></>}
    {type==='unit'&&<><label>Nama Unit<input value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="Contoh: TPQ Masjid"/></label><div className="formGrid2"><label>Kode<input value={f.code||''} onChange={e=>setF({...f,code:e.target.value})} placeholder="Opsional"/></label><label>Penanggung jawab<input value={f.person_in_charge||''} onChange={e=>setF({...f,person_in_charge:e.target.value})}/></label></div><label className="toggleRow compact"><div><b>Aktif</b><span>Unit nonaktif tetap menyimpan histori transaksi.</span></div><input type="checkbox" checked={!!f.active} onChange={e=>setF({...f,active:e.target.checked})}/></label></>}
    {type==='budget'&&<><div className="formGrid2"><label>Nama Anggaran<input value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="Contoh: Operasional Masjid"/></label><label>Kode<input value={f.code||''} onChange={e=>setF({...f,code:e.target.value})} placeholder="Opsional"/></label><label>Bidang / Kelompok<input value={f.budget_group} onChange={e=>setF({...f,budget_group:e.target.value})}/></label><label>Nilai Pagu<input type="number" min="0" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/></label></div></>}
    {type==='inventory'&&<><div className="formGrid2"><label>Nama aset<input value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></label><label>Kode aset<input value={f.code||''} onChange={e=>setF({...f,code:e.target.value})} placeholder="Opsional"/></label><label>Lokasi<input value={f.location||''} onChange={e=>setF({...f,location:e.target.value})}/></label><label>Tanggal perolehan<input type="date" value={f.acquired_on||''} onChange={e=>setF({...f,acquired_on:e.target.value})}/></label><label>Jumlah<input type="number" min="1" value={f.quantity} onChange={e=>setF({...f,quantity:e.target.value})}/></label><label>Satuan<input value={f.unit||''} onChange={e=>setF({...f,unit:e.target.value})} placeholder="unit / buah / set"/></label><label>Nilai per unit<input type="number" min="0" value={f.unit_value} onChange={e=>setF({...f,unit_value:e.target.value})}/></label><label>Kondisi<select value={f.condition} onChange={e=>setF({...f,condition:e.target.value})}><option value="good">Baik</option><option value="service">Perlu Servis</option><option value="damaged">Rusak</option><option value="inactive">Tidak Aktif</option></select></label><label>Dana sumber<select value={f.fund_id||''} onChange={e=>setF({...f,fund_id:e.target.value})}><option value="">Tidak diketahui</option>{m.funds.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label className="span2">Catatan<textarea rows="3" value={f.notes||''} onChange={e=>setF({...f,notes:e.target.value})}/></label></div></>}
    <div className="modalFooter inner"><Button onClick={close}>Batal</Button><Button variant="primary" onClick={save} disabled={busy||!f.name}>{busy?'Menyimpan...':'Simpan '+title}</Button></div>
  </Modal>
}


function Guide({go,open,perms}){
  const[query,setQuery]=useState('');
  const guides=[
    {icon:I.LayoutDashboard,title:'Mulai dari Dashboard',text:'Periksa Total Kas, Dana Bebas, Dana Terikat, surplus/defisit, dan peringatan keuangan.',page:'dashboard'},
    {icon:I.ArrowLeftRight,title:'Catat transaksi harian',text:'Gunakan Pemasukan untuk uang masuk, Pengeluaran untuk uang keluar, dan Transfer hanya untuk perpindahan antar Kas/Rekening.',page:'transactions'},
    {icon:I.WalletCards,title:'Pahami Dana vs Kas',text:'Dana menjelaskan peruntukan uang. Kas/Rekening menjelaskan lokasi uang. Keduanya harus tetap seimbang.',page:'funds'},
    {icon:I.Box,title:'Kotak Amal',text:'Lakukan penghitungan dengan dua saksi, rincikan per titik, pilih Dana dan Kas tujuan, lalu posting.',page:'boxes'},
    {icon:I.ChartNoAxesColumnIncreasing,title:'Kontrol Anggaran',text:'Buat pagu per bidang lalu pantau realisasi dari transaksi pengeluaran yang sudah POSTED.',page:'budgets'},
    {icon:I.FileText,title:'Buat laporan',text:'Pilih rentang tanggal, cek preview, lalu ekspor Excel/CSV, Word, atau cetak PDF bersih tanpa tampilan aplikasi.',page:'reports'},
    {icon:I.UserRoundCog,title:'Atur tim',text:'Owner dapat menambahkan akun yang sudah terdaftar dan menentukan role Bendahara, Sekretaris, Pengurus, atau Viewer.',page:'team'},
    {icon:I.FileSpreadsheet,title:'Import Excel',text:'Gunakan template Excel pada Donatur, Unit Masjid, Anggaran, Inventaris, atau Kategori untuk memasukkan banyak data sekaligus.',page:'donors'}
  ];
  const filtered=guides.filter(x=>(x.title+' '+x.text).toLowerCase().includes(query.toLowerCase()));
  return <>
    <PageHead eyebrow="PUSAT BANTUAN" title="Panduan Penggunaan" text="Panduan singkat untuk membantu pengurus memahami alur Amanah Pro tanpa perlu menebak fungsi menu." action={perms.finance?<Button variant="primary" onClick={()=>open({type:'transaction',preset:'income'})}><I.Plus/>Coba Catat Transaksi</Button>:null}/>
    <section className="guideHero">
      <div><Badge tone="brand">MULAI 5 MENIT</Badge><h2>Alur kerja yang disarankan</h2><p>1. Siapkan Dana & Kas → 2. Catat transaksi → 3. Periksa Dashboard → 4. Pantau Anggaran → 5. Buat Laporan.</p></div>
      <div className="guideFlow"><span><I.WalletCards/>Dana & Kas</span><I.ArrowRight/><span><I.ReceiptText/>Transaksi</span><I.ArrowRight/><span><I.BarChart3/>Rekap</span><I.ArrowRight/><span><I.FileCheck2/>Laporan</span></div>
    </section>
    <div className="guideSearch"><I.Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari panduan, misal: kotak amal, laporan, transaksi..."/></div>
    <div className="guideGrid">{filtered.map((x,i)=><button className="guideCard" key={i} onClick={()=>go(x.page)}><div className="guideIcon"><x.icon/></div><div><b>{x.title}</b><p>{x.text}</p><span>Buka menu <I.ArrowRight/></span></div></button>)}</div>
    <section className="cardPro guideTips"><SectionHead title="Aturan penting agar laporan benar" text="Empat prinsip ini menjaga data keuangan tetap konsisten."/>
      <div className="tipGrid"><div><I.CircleCheck/><b>Saldo hanya berubah saat POSTED</b><span>Draft dan pending tidak dihitung sebagai saldo final.</span></div><div><I.Scale/><b>Dana harus sama dengan Kas</b><span>Selisih berarti ada transaksi/alokasi yang perlu diperiksa.</span></div><div><I.History/><b>Jangan hapus transaksi lama</b><span>Gunakan pembatalan/void agar jejak audit tetap ada.</span></div><div><I.ShieldCheck/><b>Gunakan approval untuk nominal besar</b><span>Atur ambang approval di Pengaturan → Kebijakan.</span></div></div>
    </section>
  </>
}

const importSpecs={
  donor:{
    title:'Donatur',table:'donors',
    headers:['Nama','Kode','No HP','Alamat','Komitmen Bulanan','Dana Pilihan','Aktif'],
    example:[['Ahmad','DON-001','08123456789','Malang',250000,'Infaq Umum','YA']],
    required:['Nama']
  },
  unit:{
    title:'Unit Masjid',table:'units',
    headers:['Nama','Kode','Penanggung Jawab','Aktif'],
    example:[['TPQ Al Amanah','UNIT-001','Ust. Ahmad','YA']],
    required:['Nama']
  },
  budget:{
    title:'Anggaran',table:'budgets',
    headers:['Nama','Kode','Bidang','Nilai Pagu'],
    example:[['Operasional Bulanan','ANG-001','Operasional Masjid',5000000]],
    required:['Nama','Bidang','Nilai Pagu']
  },
  inventory:{
    title:'Inventaris',table:'inventory',
    headers:['Nama','Kode','Lokasi','Jumlah','Satuan','Nilai Per Unit','Tanggal Perolehan','Dana Sumber','Kondisi','Catatan'],
    example:[['Kipas Angin','INV-001','Ruang Utama',4,'unit',450000,today(),'Infaq Umum','good','Kondisi baik']],
    required:['Nama']
  },
  category:{
    title:'Kategori Transaksi',table:'categories',
    headers:['Nama','Jenis','Kode','Kelompok Anggaran','Dana Default','Aktif'],
    example:[['Listrik dan Air','expense','PK-010','Operasional Masjid','','YA']],
    required:['Nama','Jenis']
  }
};

function ImportExcelModal({close,action,mosque,m,d,reload,notify}){
  const spec=importSpecs[action.entity];
  const[rows,setRows]=useState([]),[errors,setErrors]=useState([]),[busy,setBusy]=useState(false),[fileName,setFileName]=useState('');
  const downloadTemplate=async()=>{
    const XLSX=await import('xlsx');
    const ws=XLSX.utils.aoa_to_sheet([spec.headers,...spec.example]);
    ws['!cols']=spec.headers.map(h=>({wch:Math.max(14,h.length+3)}));
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Data');
    XLSX.writeFile(wb,'template-'+action.entity+'-amanah-pro.xlsx');
  };
  const readFile=async file=>{
    setFileName(file?.name||'');setRows([]);setErrors([]);
    if(!file)return;
    try{
      const XLSX=await import('xlsx');
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array',cellDates:false});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const parsed=XLSX.utils.sheet_to_json(ws,{defval:''});
      if(!parsed.length)throw Error('File Excel kosong.');
      const errs=[];
      parsed.forEach((r,i)=>spec.required.forEach(h=>{if(String(r[h]??'').trim()==='')errs.push('Baris '+(i+2)+': kolom '+h+' wajib diisi.')}))
      setRows(parsed);setErrors(errs);
    }catch(e){setErrors([e.message||'File Excel tidak dapat dibaca.'])}
  };
  const findFund=name=>m.funds.find(x=>x.name.trim().toLowerCase()===String(name||'').trim().toLowerCase())?.id||null;
  const yn=v=>!['TIDAK','NO','FALSE','0','NONAKTIF'].includes(String(v||'YA').trim().toUpperCase());
  const importNow=async()=>{
    if(errors.length||!rows.length)return;setBusy(true);
    try{
      const openPeriod=d.periods.find(x=>x.status==='open');
      const base=Date.now().toString().slice(-6);
      const payload=rows.map((r,i)=>{
        if(action.entity==='donor')return{mosque_id:mosque.id,name:String(r['Nama']).trim(),code:String(r['Kode']||'').trim()||null,phone:String(r['No HP']||'').trim()||null,address:String(r['Alamat']||'').trim()||null,monthly_commitment:r['Komitmen Bulanan']===''?null:num(r['Komitmen Bulanan']),preferred_fund_id:findFund(r['Dana Pilihan']),active:yn(r['Aktif'])};
        if(action.entity==='unit')return{mosque_id:mosque.id,name:String(r['Nama']).trim(),code:String(r['Kode']||'').trim()||('UNIT-'+base+'-'+(i+1)),person_in_charge:String(r['Penanggung Jawab']||'').trim()||null,active:yn(r['Aktif'])};
        if(action.entity==='budget'){if(!openPeriod)throw Error('Tidak ada periode aktif untuk import anggaran.');return{mosque_id:mosque.id,period_id:openPeriod.id,name:String(r['Nama']).trim(),code:String(r['Kode']||'').trim()||('ANG-'+base+'-'+(i+1)),budget_group:String(r['Bidang']).trim(),amount:num(r['Nilai Pagu'])}}
        if(action.entity==='inventory')return{mosque_id:mosque.id,name:String(r['Nama']).trim(),code:String(r['Kode']||'').trim()||('INV-'+base+'-'+(i+1)),location:String(r['Lokasi']||'').trim()||null,quantity:num(r['Jumlah'])||1,unit:String(r['Satuan']||'unit').trim()||'unit',unit_value:num(r['Nilai Per Unit']),acquired_on:normalizeExcelDate(r['Tanggal Perolehan'])||null,fund_id:findFund(r['Dana Sumber']),condition:['good','service','damaged','inactive'].includes(String(r['Kondisi']).toLowerCase())?String(r['Kondisi']).toLowerCase():'good',notes:String(r['Catatan']||'').trim()||null};
        if(action.entity==='category'){const kind=String(r['Jenis']).trim().toLowerCase();if(!['income','expense'].includes(kind))throw Error('Jenis kategori harus income atau expense.');return{mosque_id:mosque.id,name:String(r['Nama']).trim(),kind,code:String(r['Kode']||'').trim()||((kind==='income'?'PM-':'PK-')+base+'-'+(i+1)),budget_group:kind==='expense'?(String(r['Kelompok Anggaran']||'').trim()||null):null,default_fund_id:findFund(r['Dana Default']),active:yn(r['Aktif'])}}
        return null;
      }).filter(Boolean);
      await insertRecords(spec.table,payload);
      notify(payload.length+' data '+spec.title+' berhasil diimport');reload();close();
    }catch(e){setErrors([e.message])}finally{setBusy(false)}
  };
  return <Modal title={'Import Excel — '+spec.title} text="Gunakan template agar kolom terbaca dengan benar. Data ditampilkan dulu sebelum disimpan." close={close} size="lg">
    <div className="importSteps"><span className="active">1. Unduh template</span><I.ArrowRight/><span className={fileName?'active':''}>2. Isi & unggah</span><I.ArrowRight/><span className={rows.length&&!errors.length?'active':''}>3. Periksa & import</span></div>
    <div className="importActions"><Button onClick={downloadTemplate}><I.Download/>Unduh Template Excel</Button><label className="fileButton"><I.Upload/>Pilih File Excel<input type="file" accept=".xlsx,.xls" onChange={e=>readFile(e.target.files?.[0])}/></label></div>
    {fileName&&<div className="fileInfo"><I.FileSpreadsheet/><div><b>{fileName}</b><span>{rows.length} baris terbaca</span></div></div>}
    {errors.length>0&&<div className="inlineAlert danger"><I.CircleAlert/><div><b>File perlu diperbaiki</b>{errors.slice(0,6).map((x,i)=><div key={i}>{x}</div>)}{errors.length>6&&<div>+ {errors.length-6} kesalahan lainnya</div>}</div></div>}
    {rows.length>0&&<div className="importPreview"><table><thead><tr>{spec.headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.slice(0,8).map((r,i)=><tr key={i}>{spec.headers.map(h=><td key={h}>{String(r[h]??'')}</td>)}</tr>)}</tbody></table>{rows.length>8&&<small>Preview 8 dari {rows.length} baris.</small>}</div>}
    <div className="inlineAlert info"><I.Info/>Import Excel tersedia untuk data master dan perencanaan. Transaksi keuangan tidak diimport massal agar saldo, approval, dan audit tetap tervalidasi.</div>
    <div className="modalFooter inner"><Button onClick={close}>Batal</Button><Button variant="primary" disabled={!rows.length||!!errors.length||busy} onClick={importNow}>{busy?'Mengimport...':'Import '+rows.length+' Data'}</Button></div>
  </Modal>
}

function normalizeExcelDate(v){
  if(!v)return '';
  if(typeof v==='number'){const base=new Date(Date.UTC(1899,11,30));base.setUTCDate(base.getUTCDate()+v);return base.toISOString().slice(0,10)}
  const s=String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  const d=new Date(s);return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10)
}

function printCleanReport(mosque,start,end,rows,income,expense){
  const w=window.open('','_blank','noopener,noreferrer,width=1000,height=760');
  if(!w)return alert('Izinkan pop-up untuk mencetak laporan.');
  const title='Laporan Keuangan - '+(mosque?.name||'Masjid');
  w.document.open();
  w.document.write(reportPrintHtml(mosque,start,end,rows,income,expense,title));
  w.document.close();
  w.onload=()=>{setTimeout(()=>{w.focus();w.print()},250)};
}
function reportPrintHtml(mosque,start,end,rows,income,expense,title){
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  return '<!doctype html><html><head><meta charset="utf-8"><title>'+safe(title)+'</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:11px}header{display:flex;justify-content:space-between;border-bottom:2px solid #4c2268;padding-bottom:12px;margin-bottom:18px}h1{font-size:20px;margin:0 0 4px}.muted{color:#666}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}.sum{border:1px solid #ddd;border-radius:8px;padding:10px}.sum span{display:block;color:#666;font-size:10px}.sum b{display:block;margin-top:4px;font-size:14px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:7px 5px;text-align:left;vertical-align:top}th{background:#f4eef7;font-size:9px;text-transform:uppercase}td.amount{text-align:right;font-weight:bold}footer{margin-top:18px;border-top:1px solid #ddd;padding-top:10px;color:#666;font-size:9px}@media print{button{display:none}}</style></head><body><header><div><h1>'+safe(mosque?.name||'Masjid')+'</h1><div class="muted">Laporan Keuangan • '+safe(fmtDate(start))+' — '+safe(fmtDate(end))+'</div></div><div class="muted">Bantu Beres Amanah Pro<br>'+safe(fmtDate(today()))+'</div></header><section class="summary"><div class="sum"><span>Pemasukan</span><b>'+safe(rp(income))+'</b></div><div class="sum"><span>Pengeluaran</span><b>'+safe(rp(expense))+'</b></div><div class="sum"><span>Surplus / Defisit</span><b>'+safe(rp(income-expense))+'</b></div></section><table><thead><tr><th>Tanggal</th><th>No Bukti</th><th>Jenis</th><th>Uraian</th><th>Dana</th><th>Kas</th><th>Nominal</th></tr></thead><tbody>'+rows.map(t=>'<tr><td>'+safe(fmtDate(t.tx_date))+'</td><td>'+safe(t.document_no)+'</td><td>'+safe(kindLabel[t.kind])+'</td><td>'+safe(t.description)+'</td><td>'+safe(t.funds?.name||'—')+'</td><td>'+safe(t.cash_accounts?.name||'—')+'</td><td class="amount">'+safe(rp(t.amount))+'</td></tr>').join('')+'</tbody></table><footer>Dokumen ini dibuat dari transaksi berstatus POSTED pada Amanah Pro. Transfer antar Kas tidak dihitung sebagai pemasukan atau pengeluaran.</footer></body></html>'
}
function monthSeries(rows,count){
  const out=[];const now=new Date();
  for(let i=count-1;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);const key=d.toISOString().slice(0,7);out.push({key,label:d.toLocaleDateString('id-ID',{month:'short'}),income:0,expense:0})}
  for(const t of rows){const x=out.find(v=>v.key===String(t.tx_date).slice(0,7));if(!x)continue;if(t.kind==='income')x.income+=num(t.amount);if(t.kind==='expense')x.expense+=num(t.amount)}
  return out;
}
function budgetRealization(budgets,rows){return (budgets||[]).map(b=>{const realized=rows.filter(t=>t.kind==='expense'&&t.categories?.budget_group===b.budget_group).reduce((s,t)=>s+num(t.amount),0);return{...b,realized,percent:num(b.amount)?realized/num(b.amount)*100:0}})}
function boxTotal(x){return (x.counts||[]).reduce((s,c)=>s+num(c.large_notes)+num(c.small_notes)+num(c.coins)+num(c.other),0)}
function download(name,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500)}
function toCsv(rows){const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';return ['Tanggal,No Bukti,Jenis,Uraian,Dana,Kas,Nominal,Status',...rows.map(t=>[t.tx_date,t.document_no,kindLabel[t.kind],t.description,t.funds?.name||'',t.cash_accounts?.name||'',t.amount,statusLabel[t.status]||t.status].map(esc).join(','))].join('\n')}
function reportHtml(mosque,start,end,rows,income,expense){return `<html><meta charset="utf-8"><body style="font-family:Arial"><h1>${mosque?.name||'Masjid'}</h1><p>Laporan Keuangan ${start} s.d. ${end}</p><p><b>Pemasukan:</b> ${rp(income)} &nbsp; <b>Pengeluaran:</b> ${rp(expense)} &nbsp; <b>Surplus/Defisit:</b> ${rp(income-expense)}</p><table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th>Tanggal</th><th>No Bukti</th><th>Jenis</th><th>Uraian</th><th>Nominal</th></tr>${rows.map(t=>`<tr><td>${t.tx_date}</td><td>${t.document_no}</td><td>${kindLabel[t.kind]}</td><td>${t.description}</td><td>${rp(t.amount)}</td></tr>`).join('')}</table></body></html>`}
