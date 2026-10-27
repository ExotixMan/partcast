import Form from '../components/Form.jsx';
import {useEffect,useState} from 'react';
import {ShieldCheck,Save,RefreshCw,Mail,AlertTriangle} from 'lucide-react';
import {t,useLocale} from '../context/LocaleContext.jsx';
import {api} from '../lib/api.js';
import PageHeader from '../components/PageHeader.jsx';
import Loading from '../components/Loading.jsx';

const fields={
 oauth:[['sender_email','Gmail sender address',254],['client_id','Google client ID',500],['client_secret','Google client secret',1000],['refresh_token','Google refresh token',4096]],
 smtp:[['sender_email','Gmail sender address',254],['app_password','Google App Password',128]],
 gemini:[['api_key','Gemini API key',500],['model','Gemini model',100]]
};
const initialDraft=row=>row.provider==='gmail'
 ?{enabled:row.enabled,delivery_method:row.delivery_method==='smtp'?'smtp':'oauth',sender_email:row.sender_email||''}
 :{enabled:row.enabled,model:row.model||'gemini-2.5-flash'};

export default function ITSettingsPage(){
 useLocale();
 const [rows,setRows]=useState([]),[draft,setDraft]=useState({}),[engine,setEngine]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function load(){
  setLoading(true);setError('');
  try{const result=await api.get('/api/admin/integrations');setRows(result.data);setEngine(result.forecasting);setDraft(Object.fromEntries(result.data.map(row=>[row.provider,initialDraft(row)])));}
  catch(cause){setError(cause.message);}
  finally{setLoading(false);}
 }
 useEffect(()=>{load();},[]);
 function update(provider,key,value){setMessage('');setDraft(current=>({...current,[provider]:{...current[provider],[key]:value}}));}
 async function save(event,row){
  event.preventDefault();if(busy)return;
  const provider=row.provider,value=draft[provider],method=value.delivery_method||'oauth';
  if(provider==='gmail'&&method==='smtp'&&!row.smtp_supported)return;
  setBusy(provider);setError('');setMessage('');
  try{
   const keys=fields[provider==='gmail'?method:'gemini'].map(([key])=>key);
   const patch={enabled:value.enabled,...(provider==='gmail'?{delivery_method:method}:{})};
   for(const key of keys)if(String(value[key]||'').trim())patch[key]=value[key];
   const result=await api.patch(`/api/admin/integrations/${provider}`,patch);
   setRows(current=>current.map(item=>item.provider===provider?result.data:item));
   setDraft(current=>({...current,[provider]:initialDraft(result.data)}));
   setMessage('Connection settings saved. Secret fields are hidden after saving.');
  }catch(cause){setError(cause.message);}
  finally{setBusy('');}
 }
 async function test(provider){
  if(busy)return;
  setBusy(provider);setError('');setMessage('');
  try{const result=await api.post(`/api/admin/integrations/${provider}/test`,{});setMessage(result.message);}
  catch(cause){setError(cause.message);}
  finally{setBusy('');}
 }
 return <><PageHeader title={t('IT settings')} subtitle={t('Super Admin only. Manage Google connections and check the forecasting engine.')} />
  {error&&<div role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-red-800"><p className="break-words">{t(error)}</p>{!rows.length&&<button className="btn-secondary mt-3" onClick={load}>{t('Try again')}</button>}</div>}
  {message&&<p role="status" className="mb-5 rounded-xl bg-emerald-50 p-4 text-emerald-800">{t(message)}</p>}
  {loading?<Loading/>:<>
   <div className="mb-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6"><ShieldCheck className="shrink-0 text-emerald-600" aria-hidden="true"/><p>{t('Connection secrets are encrypted on the server and never displayed again. Leave a saved secret blank to keep it. Enter credentials only here or in server environment settings.')}</p></div>
   <div className="grid items-start gap-5 xl:grid-cols-2">{rows.map(row=>{
    const provider=row.provider,value=draft[provider]||{},gmail=provider==='gmail',method=value.delivery_method||'oauth';
    const definitions=fields[gmail?method:'gemini'];
    const saved=initialDraft(row);
    const dirty=Object.entries(value).some(([key,entry])=>key in saved?entry!==saved[key]:Boolean(String(entry||'').trim()));
    return <Form key={provider} className="panel min-w-0 space-y-4 p-5 sm:p-6" onSubmit={event=>save(event,row)} aria-label={gmail?t('Gmail login codes'):t('Gemini chatbot')}>
     <div><h2 className="text-lg font-bold">{gmail?t('Gmail login codes'):t('Gemini chatbot')}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{gmail?t('Sign-in codes and reviewed supplier emails.'):t('Answer questions after local help and saved store data have been checked.')}</p>
      <p className={`mt-2 text-sm font-semibold ${row.ready?'text-emerald-700':'text-amber-800'}`}>{row.ready?t('Connection configured'):t('Setup needed')}</p>
      {gmail&&row.ready&&<p className="mt-1 text-sm text-slate-600">{t('Saved connection')}: {row.delivery_method==='smtp'?t('Gmail SMTP (App Password)'):t('Gmail API (OAuth)')}</p>}
     </div>
     <fieldset disabled={Boolean(busy)} className="min-w-0 space-y-4">
      {gmail?<label className="block"><span className="label">{t('Email connection')}</span><select aria-label={t('Email connection')} className="input" value={method} onChange={event=>{
       setMessage('');setError('');
       const next=event.target.value;
       setDraft(current=>({...current,[provider]:{enabled:current[provider].enabled,sender_email:current[provider].sender_email,delivery_method:next}}));
      }}><option value="oauth">{t('Gmail API (OAuth)')}</option><option value="smtp" disabled={!row.smtp_supported}>{t('Gmail SMTP (App Password)')}</option></select></label>
      :<label className="flex min-h-12 items-center gap-3"><input className="h-5 w-5" type="checkbox" checked={value.enabled??true} onChange={event=>update(provider,'enabled',event.target.checked)}/><span className="font-medium">{t('Enable connection')}</span></label>}
      {gmail&&method==='smtp'&&<div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900" role="note"><AlertTriangle size={19} className="mt-1 shrink-0" aria-hidden="true"/><p>{t('SMTP requires hosting that allows port 465. Render Free blocks SMTP.')}</p></div>}
      {gmail&&!row.smtp_supported&&<p className="text-sm text-amber-800">{t('SMTP setup requires the updated API.')}</p>}
      {definitions.map(([key,label,max])=>{
       const secret=!['sender_email','model'].includes(key);
       return <label key={key} className="block"><span className="label">{t(label)}</span><input className="input" type={secret?'password':key==='sender_email'?'email':'text'} autoComplete="off" spellCheck={false} maxLength={max} value={value[key]||''} required={Boolean(value.enabled&&(!secret||!row.fields?.[key]))} placeholder={secret&&row.fields?.[key]?t('Saved — leave blank to keep'):''} pattern={key==='model'?'gemini-[a-zA-Z0-9.-]+':undefined} onChange={event=>update(provider,key,event.target.value)}/></label>;
      })}
      <div className="flex flex-wrap gap-2"><button className="btn-primary" type="submit"><Save size={17} className="shrink-0" aria-hidden="true"/>{busy===provider?(gmail&&method==='smtp'?t('Checking connection…'):t('Saving…')):gmail&&method==='smtp'?t('Check and save connection'):t('Save connection')}</button><button className="btn-secondary" type="button" disabled={!row.ready||dirty} onClick={()=>test(provider)}>{t('Check saved connection')}</button></div>
      {dirty&&<p className="text-sm leading-6 text-slate-600">{t('Save changes before checking the saved connection.')}</p>}
     </fieldset>
     {gmail&&<details className="rounded-xl bg-slate-50 p-4 text-sm leading-6"><summary className="min-h-11 cursor-pointer font-semibold">{t('Google setup guide')}</summary>
      {method==='smtp'?<><p className="mt-3">{t('Enable Google 2-Step Verification for the sending account, create a Google App Password, and enter that 16-character password here. The connection is checked before saving.')}</p><a className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold text-red-700 underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer"><Mail size={18} className="shrink-0" aria-hidden="true"/>{t('Create Google App Password')}</a></>
      :<><p className="mt-3">{t('Enable Gmail API in Google Cloud. Create an OAuth client and authorize the sender with the gmail.send scope and offline access. Store the client ID, client secret, refresh token, and sender address. Staff login uses a password followed by a six-digit code; Google account sign-in is not required.')}</p><a className="mt-3 inline-block font-semibold text-red-700 underline" href="https://developers.google.com/workspace/gmail/api/auth/scopes" target="_blank" rel="noreferrer">{t('Open Google documentation')}</a></>}
     </details>}
    </Form>;
   })}</div>
   <section className="panel mt-5 p-5"><h2 className="font-bold">{t('Forecasting engine')}</h2><p className={`mt-2 text-sm ${engine?.ready?'text-emerald-700':'text-amber-800'}`}>{t(engine?.message||'Check the API connection.')}</p><p className="mt-2 text-sm text-slate-600">{t('Python is detected on this server. Run the setup script if dependencies are missing. A copied virtual environment from another computer will not work.')}</p><button className="btn-secondary mt-3" disabled={Boolean(busy)} onClick={load}><RefreshCw size={17} aria-hidden="true"/>{t('Check again')}</button></section>
  </>}
 </>;
}
