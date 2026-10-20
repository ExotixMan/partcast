import {useEffect,useId,useRef,useState} from 'react';
import {t,useLocale} from '../context/LocaleContext.jsx';
import {formProblems} from '../lib/formValidation.js';



export default function Form({children,onSubmit,onInvalidCapture,onChangeCapture,noValidate=false,...props}) {
 useLocale();
 const [issues,setIssues]=useState([]),[failure,setFailure]=useState(false);
 const ref=useRef(null),id=useId();
 useEffect(()=>{
  const owned=issues.map((issue,index)=>{
   const field=issue.field,previousInvalid=field.getAttribute('aria-invalid'),previousMessage=field.getAttribute('aria-errormessage');
   field.setAttribute('aria-invalid','true');field.setAttribute('aria-errormessage',`${id}-${index}`);
   return ()=>{if(previousInvalid===null)field.removeAttribute('aria-invalid');else field.setAttribute('aria-invalid',previousInvalid);if(previousMessage===null)field.removeAttribute('aria-errormessage');else field.setAttribute('aria-errormessage',previousMessage);};
  });
  return ()=>owned.forEach(clear=>clear());
 },[issues,id]);
 const check=(form,focus=true)=>{
  const found=formProblems(form);setIssues(found);
  if(focus&&found.length)found[0].field.focus();
  return found.length===0;
 };
 function submit(event) {
  if(!noValidate&&!check(event.currentTarget)){event.preventDefault();return;}
  setFailure(false);
  try {const result=onSubmit?.(event);if(result?.catch)result.catch(()=>setFailure(true));}
  catch {event.preventDefault();setFailure(true);}
 }
 return <form {...props} ref={ref} noValidate onSubmit={submit} onInvalidCapture={event=>{
  onInvalidCapture?.(event);event.preventDefault();const form=event.currentTarget;
  queueMicrotask(()=>{if(form.isConnected)check(form);});
 }} onChangeCapture={event=>{onChangeCapture?.(event);if(issues.length)check(event.currentTarget,false);}}>
  {issues.length>0&&<div role="alert" className="form-feedback col-span-full mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
   <p className="font-semibold">{t('Check these fields')}</p>
   <ul className="mt-1">{issues.map((issue,index)=><li key={index} id={`${id}-${index}`}><button type="button" className="min-h-11 w-full break-words py-1 text-left underline underline-offset-2" onClick={()=>issue.field.focus()}><strong>{issue.label||t('This field')}:</strong> {t(issue.key,issue.values)}</button></li>)}</ul>
  </div>}
  {failure&&<p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{t('This request could not be confirmed. Check saved records before trying again.')}</p>}
  {children}
 </form>;
}
