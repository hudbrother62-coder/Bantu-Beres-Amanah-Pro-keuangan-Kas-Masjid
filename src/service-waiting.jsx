import {useEffect,useRef,useState} from 'react'
import {Clock3,ShieldCheck,RefreshCw,Mail,AlertCircle} from 'lucide-react'
import {supabase} from './supabase'
import {
  QUOTA_CHECK_INTERVAL, WAIT_EVENT, EMAIL_RETRY_INTERVAL,
  getServiceWait,getPendingRecovery,isQuotaError,isEmailRateError,
  markQuotaWait,markEmailWait,postponeQuotaCheck,deferRecovery,
  clearServiceWait,clearPendingRecovery,markRecoverySent,queueRecovery
} from './quota-service'
const fmtDuration = ms => {
  const total = Math.max(0,Math.ceil(ms/1000))
  const days=Math.floor(total/86400),hours=Math.floor(total%86400/3600),mins=Math.floor(total%3600/60),secs=total%60
  return (days?days+' hari ':'')+[hours,mins,secs].map(x=>String(x).padStart(2,'0')).join(':')
}
const fmtDate=ms=>new Intl.DateTimeFormat('id-ID',{dateStyle:'full',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(ms))+' WIB'
const maskEmail=email=>email?email.replace(/^(.{1,2})[^@]*(?=@)/, '$1•••'):''
export default function ServiceWaiting() {
  const [wait,setWait]=useState(getServiceWait)
  const [now,setNow]=useState(Date.now())
  const [restorationAt,setRestorationAt]=useState(null)
  const [checking,setChecking]=useState(false)
  const [notice,setNotice]=useState('')
  const [recoveryEmail,setRecoveryEmail]=useState('')
  const inFlight=useRef(false)
  useEffect(()=>{
    const timer=setInterval(()=>setNow(Date.now()),1000)
    const changed=()=>setWait(getServiceWait())
    window.addEventListener(WAIT_EVENT,changed)
    window.addEventListener('storage',changed)
    return()=>{clearInterval(timer);window.removeEventListener(WAIT_EVENT,changed);window.removeEventListener('storage',changed)}
  },[])

  async function sendPendingRecovery(){
    const pending=getPendingRecovery()
    if(!pending){clearServiceWait();return}
    if(pending.nextAttemptAt>Date.now()){markEmailWait();return}
    // Reserve one attempt before calling the email provider; no duplicate requests across rerenders.
    deferRecovery(EMAIL_RETRY_INTERVAL)
    try{
      const {error}=await supabase.auth.resetPasswordForEmail(pending.email,{redirectTo:location.origin+'/?bbreset=finish'})
      if(error)throw error
      clearPendingRecovery()
      markRecoverySent()
    }catch(error){
      if(isQuotaError(error)){markQuotaWait();setNotice('Server masih dibatasi kuota. Permintaan tetap tersimpan di perangkat ini.')}
      else if(isEmailRateError(error)){markEmailWait();setNotice('Kuota pengiriman email sedang penuh. Akan dicoba lagi pada jadwal berikutnya.')}
      else {clearPendingRecovery();setNotice('Pemulihan belum bisa dikirim: '+(error?.message||'Kesalahan server')+'. Silakan coba kembali setelah layanan pulih.')}
    }
  }
  async function checkAvailability(){
    if(inFlight.current)return
    inFlight.current=true
    setChecking(true)
    setNotice('')
    const current=getServiceWait()
    try{
      if(current?.type==='email'){await sendPendingRecovery();return}
      if(current?.type!=='quota')return
      // Schedule the next probe first, even on network failure, to avoid excessive egress.
      postponeQuotaCheck(QUOTA_CHECK_INTERVAL)
      const response=await fetch('/api/service-status',{cache:'no-store'})
      if(!response.ok)throw new Error('Pemeriksaan belum tersedia')
      const data=await response.json()
      if(data.quotaRenewAt&&Number.isFinite(Date.parse(data.quotaRenewAt)))setRestorationAt(Date.parse(data.quotaRenewAt))
      if(data.status==='available'){
        if(getPendingRecovery())await sendPendingRecovery()
        else{clearServiceWait();window.location.reload()}
      }else if(data.status==='unknown')setNotice('Server belum bisa dipastikan pulih. Pemeriksaan otomatis berikutnya tetap dijadwalkan.')
    }catch{setNotice('Pemeriksaan jaringan belum berhasil. Sistem akan mencoba pada jadwal berikutnya.')}
    finally{inFlight.current=false;setChecking(false)}
  }
  useEffect(()=>{
    if(wait && wait.type!=='sent' && wait.nextCheckAt<=now && !inFlight.current && document.visibilityState==='visible')checkAvailability()
  },[now,wait?.type,wait?.nextCheckAt])
  if(!wait)return null
  if(wait.type==='sent')return <main className="amanahWait"><section className="waitCard" role="status">
    <div className="waitBrand">BANTU BERES · AMANAH PRO</div><div className="waitIcon success"><Mail size={27}/></div>
    <h1>Permintaan terkirim</h1><p>Permintaan tautan pemulihan telah diterima layanan email. Silakan periksa inbox dan spam. Pengiriman ke kotak masuk belum dapat dipastikan.</p>
    <button className="waitButton" onClick={()=>{clearServiceWait();location.assign('/')}}>Kembali ke login</button>
  </section></main>
  const isEmail=wait.type==='email'
  const countdown=fmtDuration((wait.nextCheckAt||now)-now)
  const resetCountdown=restorationAt&&restorationAt>now?fmtDuration(restorationAt-now):null
  const pending=getPendingRecovery()
  return <main className="amanahWait"><section className="waitCard" role="status" aria-live="polite">
    <div className="waitBrand">BANTU BERES · AMANAH PRO</div>
    <div className="waitIcon"><Clock3 size={27}/></div>
    <h1>{isEmail?'Permintaan pemulihan dalam antrean':'Layanan sementara dalam antrean'}</h1>
    <p>{isEmail?'Batas pengiriman email sedang tercapai. Permintaan pemulihan Anda disimpan di browser ini.':'Kuota transfer data server telah tercapai. Akun dan data Anda tetap tersimpan. Anda tidak perlu mencoba login berulang kali.'}</p>
    <div className="waitTimer">
      <span>{isEmail?'Percobaan pengiriman berikutnya':'Pemeriksaan layanan berikutnya'}</span>
      <strong aria-label={'Hitung mundur '+countdown}>{countdown}</strong>
      <small>{isEmail?'Timer percobaan pengiriman, bukan kepastian email terkirim':'Timer pemeriksaan ulang, bukan janji server pasti pulih'}</small>
    </div>
    {!isEmail&&<div className="waitMeta">
      <b>Perkiraan pembaruan kuota</b>
      {restorationAt?<><span>{fmtDate(restorationAt)}</span><small>{resetCountdown?'Hitung mundur ke jadwal: '+resetCountdown:'Jadwal telah tercapai; menunggu server membuka akses kembali'}</small></>:<span>Belum tersedia dari penyedia layanan</span>}
    </div>}
    {!pending&&!isEmail&&<form className="waitQueueForm" onSubmit={e=>{e.preventDefault();queueRecovery(recoveryEmail);setRecoveryEmail('');setNotice('Alamat email ditambahkan ke antrean pada browser ini. Sistem akan mencoba pemulihan setelah server kembali tersedia.')}}>
      <label htmlFor="wait-recovery-email">Ingin mengantre untuk pemulihan password?</label>
      <input id="wait-recovery-email" type="email" required maxLength={200} autoComplete="email" placeholder="Email akun terdaftar" value={recoveryEmail} onChange={e=>setRecoveryEmail(e.target.value)}/>
      <button type="submit">Masukkan ke antrean pemulihan</button>
    </form>}
    {pending&&<div className="waitQueue"><Mail size={17}/><div><b>Pemulihan password menunggu</b><span>{maskEmail(pending.email)} — akan dicoba kembali otomatis selama halaman ini terbuka, atau saat dibuka kembali di browser yang sama.</span></div></div>}
    {notice&&<div className="waitNotice"><AlertCircle size={16}/><span>{notice}</span></div>}
    <div className="waitFoot"><ShieldCheck size={16}/><span>Password dan kode OTP tidak disimpan di antrean.</span></div>
    <button className="waitButton" onClick={()=>checkAvailability()} disabled={checking||now<wait.nextCheckAt}>{checking?<><RefreshCw size={17}/> Memeriksa…</>:<><RefreshCw size={17}/> Cek status layanan</>}</button>
  </section></main>
}
