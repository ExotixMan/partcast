import {useEffect,useState} from 'react';
import {api} from '../lib/api.js';
import {t,useLocale} from '../context/LocaleContext.jsx';

const blank={q:'',from:'',to:''};
export default function ImportedSales({refreshKey=0}) {
  const {language}=useLocale();
  const [draft,setDraft]=useState({...blank}),[filters,setFilters]=useState({...blank});
  const [page,setPage]=useState(1),[refresh,setRefresh]=useState(0);
  const [result,setResult]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[formError,setFormError]=useState('');
  const pageSize=20,locale=language==='fil'?'fil-PH':'en-PH';
  const number=value=>Number(value).toLocaleString(locale);
  const money=value=>value===null||value===undefined?'—':Number(value).toLocaleString(locale,{style:'currency',currency:'PHP'});
  const day=value=>value?new Intl.DateTimeFormat(locale,{year:'numeric',month:'short',day:'numeric',timeZone:'Asia/Manila'}).format(new Date(`${value}T00:00:00+08:00`)):t('Date unavailable');
  useEffect(()=>{
    const controller=new AbortController();
    const params=new URLSearchParams({page:String(page),pageSize:String(pageSize),...Object.fromEntries(Object.entries(filters).filter(([,value])=>value))});
    setLoading(true);setError('');
    api.get(`/api/imports/sales?${params}`,{signal:controller.signal})
      .then(data=>{if(!controller.signal.aborted)setResult(data);})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause.message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[filters,page,refresh,refreshKey]);
  function apply(event){
    event.preventDefault();
    if(draft.from&&draft.to&&draft.from>draft.to){setFormError('Start date must be on or before end date.');return;}
    setFormError('');setPage(1);setFilters({...draft,q:draft.q.trim()});
  }
  function clear(){setDraft({...blank});setFilters({...blank});setPage(1);setFormError('');}
  const rows=Array.isArray(result?.data)?result.data:[],count=Number(result?.count||0),filtered=Object.values(filters).some(Boolean);
  return <section id="saved-past-sales" className="panel mt-5 scroll-mt-5 overflow-hidden" aria-labelledby="imported-sales-heading">
    <div className="panel-header"><div><h2 id="imported-sales-heading" className="text-lg font-bold text-slate-950">{t('Saved past sales')}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{t('Find past invoices by reference, description or date.')}</p></div></div>
    <form onSubmit={apply} className="grid min-w-0 gap-3 border-b border-slate-100 p-5 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_auto_auto] xl:items-end">
      <label className="min-w-0 sm:col-span-2 xl:col-span-1"><span className="label">{t('Search reference or description')}</span><input className="input min-w-0" type="search" maxLength={120} value={draft.q} onChange={event=>setDraft({...draft,q:event.target.value})} /></label>
      <label className="min-w-0"><span className="label">{t('From date')}</span><input className="input min-w-0" type="date" max={draft.to||undefined} value={draft.from} onChange={event=>setDraft({...draft,from:event.target.value})} /></label>
      <label className="min-w-0"><span className="label">{t('To date')}</span><input className="input min-w-0" type="date" min={draft.from||undefined} value={draft.to} onChange={event=>setDraft({...draft,to:event.target.value})} /></label>
      <button className="btn-secondary" type="submit" disabled={loading}>{t('Find invoices')}</button>
      <button className="btn-secondary" type="button" onClick={clear} disabled={loading}>{t('Clear filters')}</button>
      {formError&&<p role="alert" className="text-sm text-red-700 sm:col-span-2 xl:col-span-5">{t(formError)}</p>}
    </form>
    {loading?<p role="status" className="p-5 text-sm text-slate-600">{t('Loading saved invoices…')}</p>:error?<div role="alert" className="p-5"><p className="font-semibold">{t('Saved invoices could not be loaded.')}</p><p className="mt-2 text-sm text-red-700">{t(error)}</p><button className="btn-secondary mt-3" onClick={()=>setRefresh(value=>value+1)}>{t('Try again')}</button></div>:<>
      <p role="status" className="border-b border-slate-100 p-5 font-semibold">{t('Invoices found: {v0}',{v0:number(count)})}</p>
      {!rows.length?<div className="p-5 text-sm leading-6 text-slate-600"><p>{filtered?t('No invoices match these filters.'):t('No past invoices are saved yet. Use Import spreadsheets to add your sales file.')}</p><p className="mt-2">{t('An import marked completed can add zero new rows when those invoice references already exist. Check the added/skipped counts and notes on Import spreadsheets.')}</p></div>:<>
        <div className="divide-y divide-slate-100 lg:hidden">{rows.map(row=><article className="space-y-2 p-5" key={row.id}>
          <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="min-w-0 flex-1 break-words font-semibold">{row.reference_no||'—'}</h3><p className="font-semibold">{money(row.amount)}</p></div>
          <p className="text-sm text-slate-500">{day(row.sale_date)}</p><p className="break-words text-sm leading-6 text-slate-700">{row.raw_items||t('No item description recorded.')}</p>
        </article>)}</div>
        <div className="hidden overflow-auto lg:block"><table className="w-full text-left text-sm"><caption className="sr-only">{t('Saved invoice references, dates, descriptions and amounts')}</caption><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">{t('Reference')}</th><th className="px-5 py-3">{t('Date')}</th><th className="px-5 py-3">{t('Description')}</th><th className="px-5 py-3 text-right">{t('Invoice amount')}</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(row=><tr key={row.id}><td className="px-5 py-4 font-semibold">{row.reference_no||'—'}</td><td className="whitespace-nowrap px-5 py-4">{day(row.sale_date)}</td><td className="max-w-lg break-words px-5 py-4">{row.raw_items||t('No item description recorded.')}</td><td className="whitespace-nowrap px-5 py-4 text-right">{money(row.amount)}</td></tr>)}</tbody></table></div>
      </>}
      {count>pageSize&&<nav aria-label={t('Saved invoice pages')} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-5"><button className="btn-secondary" disabled={page===1} onClick={()=>setPage(value=>value-1)}>{t('Previous')}</button><p className="text-sm text-slate-600">{t('Page {v0} of {v1}',{v0:page,v1:Math.ceil(count/pageSize)})}</p><button className="btn-secondary" disabled={page*pageSize>=count} onClick={()=>setPage(value=>value+1)}>{t('Next')}</button></nav>}
    </>}
  </section>;
}
