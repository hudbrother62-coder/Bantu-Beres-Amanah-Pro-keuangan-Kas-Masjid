import {useEffect,useState} from 'react'
const shell={minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#f4f7fb',color:'#17243b',fontFamily:'system-ui,sans-serif'}
const card={width:'100%',maxWidth:440,padding:28,borderRadius:18,background:'#fff',border:'1px solid #e2e8f0',boxShadow:'0 12px 35px #11182712'}
const input={width:'100%',boxSizing:'border-box',border:'1px solid #94a3b8',borderRadius:9,padding:12,fontSize:16,marginTop:6}
export default function PasswordRecovery({client}){
 const [mode]=useState(()=>new URLSearchParams(location.search).get('bbreset')==='finish'?'finish':'request')
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('')
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('')
 const [authorized,setAuthorized]=useState(false),[checking,setChecking]=useState(mode==='finish')
 useEffect(()=>{
  if(mode!=='finish'||!client)return
  let live=true
  const {data:{subscription}}=client.auth.onAuthStateChange((event,session)=>{if(live&&event==='PASSWORD_RECOVERY'&&session){setAuthorized(true);setChecking(false)}})
  client.auth.getUser().then(({data,error})=>{if(live){setAuthorized(Boolean(data.user&&!error));setChecking(false)}}).catch(()=>{if(live)setChecking(false)})
  return()=>{live=false;subscription.unsubscribe()}
 },[client,mode])
 async function request(e){
  e.preventDefault();if(!client)return
  const to=email.trim().toLowerCase()
  const key='bb-reset:'+to
  const last=Number(localStorage.getItem(key)||0)
  if(last&&Date.now()-last<60*1000){setNotice('Permintaan baru saja dikirim. Tunggu sebentar dan periksa inbox atau spam sebelum mencoba kembali.');setError('');return}
  setBusy(true);setError('')
  try{
   const {error}=await client.auth.resetPasswordForEmail(to,{redirectTo:location.origin+'/?bbreset=finish'})
   if(error)throw error
   localStorage.setItem(key,String(Date.now()))
   setNotice('Jika email terdaftar dan layanan pengiriman aktif, tautan pemulihan akan dikirim. Periksa inbox dan spam. Jika belum diterima, coba kembali setelah beberapa menit.')
  }catch(e){setError(e.message||'Gagal mengirim email.');}finally{setBusy(false)}
 }
 async function save(e){
  e.preventDefault();if(!client||!authorized){setError('Sesi pemulihan tidak valid.');return}
  if(password.length<8||password!==confirmation){setError('Password minimal 8 karakter dan kedua isian harus sama.');return}
  setBusy(true);setError('')
  try{const {error}=await client.auth.updateUser({password});if(error)throw error;await client.auth.signOut();setAuthorized(false);setNotice('Password berhasil diganti. Silakan login dengan password baru.')}
  catch(e){setError(e.message||'Password gagal diperbarui.')}finally{setBusy(false)}
 }
 return <main style={shell}><section style={card}>
  <strong style={{fontSize:13,color:'#63738b'}}>BANTU BERES · AMANAH PRO</strong>
  <h1 style={{fontSize:24,marginBottom:6}}>{mode==='finish'?'Buat password baru':'Lupa password?'}</h1>
  <p style={{lineHeight:1.6,color:'#64748b'}}>Pemulihan hanya untuk email asli yang terdaftar. Email buatan sistem tidak dapat menerima pesan.</p>
  {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}
  {notice&&<p role="status" style={{color:'#047857'}}>{notice}</p>}
  {mode==='request'?<form onSubmit={request}><label>Email terdaftar<input style={input} type="email" required maxLength={200} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><button type="submit" disabled={busy} style={{width:'100%',padding:13,marginTop:16,border:0,borderRadius:9,color:'white',background:'#2563eb'}}>{busy?'Memproses…':'Kirim tautan pemulihan'}</button></form>:
   checking?<p>Memverifikasi tautan…</p>:authorized?<form onSubmit={save}><label>Password baru<input style={input} type="password" minLength={8} maxLength={128} required autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Konfirmasi password<input style={input} type="password" minLength={8} maxLength={128} required autoComplete="new-password" value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label><button disabled={busy} style={{width:'100%',padding:13,marginTop:16,border:0,borderRadius:9,color:'white',background:'#2563eb'}}>Simpan password</button></form>:!notice?<p>Link tidak valid atau sesi berakhir. Ajukan pemulihan baru.</p>:null}
  <p style={{marginTop:20}}><a href="/" style={{color:'#2563eb'}}>Kembali ke login</a></p>
 </section></main>
}