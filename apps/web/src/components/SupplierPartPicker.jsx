import {useEffect,useId,useRef,useState} from 'react';
import {Plus,Search} from 'lucide-react';
import {t,useLocale} from '../context/LocaleContext.jsx';
import {api} from '../lib/api.js';

export default function SupplierPartPicker({supplierId,supplierName,choices,itemIds,loading,error,onRetry,onAdd,disabled,onSaving}) {
 useLocale();
 const [choiceId,setChoiceId]=useState(''),[open,setOpen]=useState(false);
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1),[retry,setRetry]=useState(0);
 const [catalog,setCatalog]=useState([]),[count,setCount]=useState(0),[catalogLoading,setCatalogLoading]=useState(false),[catalogError,setCatalogError]=useState(''),[saving,setSaving]=useState('');
 const selected=new Set(itemIds),available=choices.filter(row=>!selected.has(row.product_id)),full=itemIds.length>=100;
 const requestNumber=useRef(0),statusId=useId();
 useEffect(()=>{if(choiceId&&!choices.some(row=>row.product_id===choiceId&&!itemIds.includes(row.product_id)))setChoiceId('');},[choiceId,choices,itemIds]);
 useEffect(()=>{
  if(!open)return;
  const request=++requestNumber.current;
  setCatalogLoading(true);setCatalogError('');
  api.get(`/api/products?page=${page}&pageSize=10&q=${encodeURIComponent(query)}`).then(result=>{
   if(request!==requestNumber.current)return;
   if(!Array.isArray(result.data)||!Number.isFinite(result.count))throw new Error('The store returned incomplete information. Please try again.');
   if(page>Math.max(1,Math.ceil(result.count/10))){setPage(Math.max(1,Math.ceil(result.count/10)));return;}
   setCatalog(result.data);setCount(result.count);
  }).catch(error=>{if(request===requestNumber.current)setCatalogError(error.message);})
   .finally(()=>{if(request===requestNumber.current)setCatalogLoading(false);});
  return()=>{requestNumber.current++;};
 },[open,query,page,retry]);
 function find(){setPage(1);setQuery(search.trim());setRetry(n=>n+1);}
 function addLinked(){
  const row=available.find(row=>row.product_id===choiceId);
  if(!row||disabled||full)return;
  onAdd(row);setChoiceId('');
 }
 async function addInventory(product){
  if(disabled||saving||full||selected.has(product.id))return;
  const linked=choices.find(row=>row.product_id===product.id);
  if(linked){onAdd(linked);return;}
  setSaving(product.id);setCatalogError('');onSaving(true);
  try{
   const result=await api.post(`/api/suppliers/${supplierId}/parts`,{product_id:product.id});
   if(result.data?.product_id!==product.id)throw new Error('The store returned incomplete information. Please try again.');
   onAdd(result.data);
  }catch(error){setCatalogError(error.message);}
  finally{setSaving('');onSaving(false);}
 }
 return <section className="space-y-3" aria-label={t('Add parts to the request')}>
  <div className="flex flex-col gap-2 sm:flex-row"><label className="min-w-0 flex-1"><span className="label">{t('Add another part from this supplier')}</span><select className="input" value={choiceId} disabled={disabled||loading||!available.length||full} aria-describedby={statusId} onChange={event=>setChoiceId(event.target.value)}><option value="">{t(loading?'Loading parts…':'Choose a part')}</option>{available.map(row=><option key={row.product_id} value={row.product_id}>{row.part_number?`${row.part_number} · `:''}{row.description}</option>)}</select></label><button type="button" className="btn-secondary sm:self-end" disabled={disabled||loading||!choiceId||full} onClick={addLinked}><Plus size={16}/>{t('Add part to request')}</button></div>
  <div id={statusId} className="text-sm text-slate-600">{loading?<p role="status">{t('Loading parts…')}</p>:error?<div role="alert"><p className="text-red-700">{t(error)}</p><button type="button" className="btn-secondary mt-2" disabled={disabled} onClick={onRetry}>{t('Try again')}</button></div>:!available.length?<p>{t('All linked parts are already in this request.')}</p>:null}{full&&<p>{t('Each email can contain up to 100 parts.')}</p>}</div>
  <button type="button" className="btn-secondary" disabled={disabled} aria-expanded={open} aria-controls={`${statusId}-inventory`} onClick={()=>setOpen(value=>!value)}><Search size={16}/>{t(open?'Close inventory search':'Find another part in inventory')}</button>
  <div id={`${statusId}-inventory`} hidden={!open} className="space-y-3 rounded-xl border border-slate-200 p-3 sm:p-4">
   <p className="text-sm text-slate-600">{t('Choose a part that {v0} supplies. Saving adds this supplier without replacing its main supplier.',{v0:supplierName})}</p>
   <div className="flex flex-col gap-2 sm:flex-row"><label className="min-w-0 flex-1"><span className="label">{t('Search inventory')}</span><input className="input" maxLength={80} value={search} placeholder={t('Part number or name')} disabled={disabled} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();find();}}}/></label><button type="button" className="btn-secondary sm:self-end" disabled={disabled} onClick={find}><Search size={16}/>{t('Search')}</button></div>
   {catalogError&&<div role="alert"><p className="text-sm text-red-700">{t(catalogError)}</p><button type="button" className="btn-secondary mt-2" disabled={disabled} onClick={()=>setRetry(n=>n+1)}>{t('Try again')}</button></div>}
   {catalogLoading?<p role="status" className="text-sm">{t('Loading parts…')}</p>:!catalogError&&<>
    {!catalog.length?<p className="text-sm text-slate-600">{t('No matching parts')}</p>:<ul className="divide-y divide-slate-100">{catalog.map(product=>{
     const added=selected.has(product.id),linked=choices.some(row=>row.product_id===product.id);
     return <li key={product.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-words font-semibold">{product.part_number||t('No part number')}</p><p className="break-words text-sm text-slate-600">{product.description}</p></div>{added?<span className="text-sm font-medium text-slate-600">{t('Already in request')}</span>:<button type="button" className="btn-secondary shrink-0" aria-label={t(linked?'Add {v0} to request':'Save supplier and add {v0}',{v0:product.description})} disabled={disabled||Boolean(saving)||full} onClick={()=>addInventory(product)}><Plus size={16}/>{t(saving===product.id?'Saving…':linked?'Add part to request':'Save supplier and add')}</button>}</li>;
    })}</ul>}
    {count>10&&<div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3"><button type="button" className="btn-secondary" disabled={disabled||page<=1} onClick={()=>setPage(value=>value-1)}>{t('Previous')}</button><span className="text-sm">{t('Page {v0} of {v1}',{v0:page,v1:Math.max(1,Math.ceil(count/10))})}</span><button type="button" className="btn-secondary" disabled={disabled||page*10>=count} onClick={()=>setPage(value=>value+1)}>{t('Next')}</button></div>}
   </>}
  </div>
 </section>;
}
