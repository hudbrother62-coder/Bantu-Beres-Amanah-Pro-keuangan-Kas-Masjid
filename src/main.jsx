import {useEffect,useState} from 'react'
import ServiceWaiting from './service-waiting'
import {getServiceWait,markQuotaWait,WAIT_EVENT} from './quota-service'
import PasswordRecovery from './password-recovery'
import {supabase} from './supabase'
import React from 'react';
import{createRoot}from'react-dom/client';
import App from'./AppV2';
import'./pro.css';
import './waiting.css';

function ApplicationRoot(){
  const [serviceWait,setServiceWait]=useState(getServiceWait)
  useEffect(()=>{
    const changed=()=>setServiceWait(getServiceWait())
    window.addEventListener(WAIT_EVENT,changed)
    window.addEventListener('storage',changed)
    // Single cheap, cached check before customers attempt login during a quota restriction.
    fetch('/api/service-status').then(r=>r.ok?r.json():null).then(data=>{
      if(data?.status==='restricted')markQuotaWait()
    }).catch(()=>{})
    return()=>{window.removeEventListener(WAIT_EVENT,changed);window.removeEventListener('storage',changed)}
  },[])
  return serviceWait?<ServiceWaiting/>:new URLSearchParams(window.location.search).has('bbreset')?<PasswordRecovery client={supabase}/>:<App/>
}
createRoot(document.getElementById('root')).render(<React.StrictMode><ApplicationRoot/></React.StrictMode>);
