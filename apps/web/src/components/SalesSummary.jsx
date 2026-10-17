import {useEffect,useMemo,useState} from 'react';
import {RefreshCw,Search} from 'lucide-react';
import {api} from '../lib/api.js';
import {t,useLocale} from '../context/LocaleContext.jsx';

export default function SalesSummary({refreshKey=0}) {
  const {language}=useLocale();
  const [draft,setDraft]=useState({from:'',to:''});
  const [range,setRange]=useState({from:'',to:''});
  const [refresh,setRefresh]=useState(0);
  const [result,setResult]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [formError,setFormError]=useState('');
  const [query,setQuery]=useState('');
  const [page,setPage]=useState(1);
  const pageSize=10;
  const locale=language==='fil'?'fil-PH':'en-PH';
  const number=value=>Number(value).toLocaleString(locale,{maximumFractionDigits:4});
  const day=value=>value?new Intl.DateTimeFormat(locale,{timeZone:'Asia/Manila',year:'numeric',month:'short',day:'numeric'}).format(new Date(`${value}T00:00:00+08:00`)):'—';
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date());

  useEffect(()=>{
    const controller=new AbortController();
    const params=new URLSearchParams(Object.entries(range).filter(([,value])=>value));
    setLoading(true);setError('');
    api.get(`/api/forecast/recorded-sales${params.size?'?'+params:''}`,{signal:controller.signal})
      .then(data=>{if(!controller.signal.aborted){setResult(data);setPage(1);}})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause.message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[range,refresh,refreshKey]);

  const filtered=useMemo(()=>{
    const search=query.trim().toLowerCase();
    return (result?.data||[]).filter(row=>`${row.part_number||''} ${row.description||''}`.toLowerCase().includes(search));
  },[result,query]);
  const visible=filtered.slice((page-1)*pageSize,page*pageSize);
  const period=row=>row.first_sale_date===row.last_sale_date?day(row.last_sale_date):`${day(row.first_sale_date)} – ${day(row.last_sale_date)}`;
  function apply(event) {
    event.preventDefault();
    if(draft.from&&draft.to&&draft.from>draft.to){setFormError('Start date must be on or before end date.');return;}
    setFormError('');setPage(1);setRange({...draft});
  }
  function allDates(){setDraft({from:'',to:''});setRange({from:'',to:''});setFormError('');setPage(1);}

  return <section className="panel mb-5 overflow-hidden" aria-labelledby="sales-summary-heading">
    <div className="panel-header"><div><h2 id="sales-summary-heading" className="text-lg font-bold text-slate-950">{t('Sales by part')}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{t('See quantities sold from counter entries and imported sales history.')}</p><p className="mt-1 text-sm leading-6 text-slate-500">{t('Only saved quantities are counted. Missing days remain unknown.')}</p></div></div>
    <form onSubmit={apply} className="grid min-w-0 gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-[1fr_1fr_auto_auto] xl:items-end">
      <label className="min-w-0"><span className="label">{t('From date')}</span><input className="input min-w-0" type="date" max={draft.to||today} value={draft.from} onChange={event=>setDraft({...draft,from:event.target.value})} /></label>
      <label className="min-w-0"><span className="label">{t('To date')}</span><input className="input min-w-0" type="date" min={draft.from||undefined} max={today} value={draft.to} onChange={event=>setDraft({...draft,to:event.target.value})} /></label>
      <button type="submit" className="btn-secondary" disabled={loading}><RefreshCw size={16} className={loading?'animate-spin':''} />{t('Show sales')}</button>
      <button type="button" className="btn-secondary" onClick={allDates} disabled={loading}>{t('All saved dates')}</button>
      {formError&&<p role="alert" className="text-sm text-red-700 sm:col-span-2 xl:col-span-4">{t(formError)}</p>}
    </form>
    {loading?<p role="status" className="p-5 text-sm text-slate-600">{t('Loading sales…')}</p>:error?<div role="alert" className="p-5"><p className="font-semibold text-amber-950">{t('Recorded quantities could not be loaded.')}</p><p className="mt-2 text-sm text-amber-900">{t(error)}</p><button className="btn-secondary mt-3" onClick={()=>setRefresh(value=>value+1)}>{t('Try again')}</button></div>:<>
      {result?.offline&&<p role="status" className="border-b border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('Saved copy from {v0}. Connect to refresh it.',{v0:new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(result.savedAt))})}</p>}
      {Number(result?.invalid_records||0)+Number(result?.future_records||0)>0&&<p role="alert" className="border-b border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('{v0} invalid or future-dated records were left out. Check the source records.',{v0:Number(result.invalid_records||0)+Number(result.future_records||0)})}</p>}
      <dl className="grid min-w-0 gap-3 border-b border-slate-100 p-4 sm:grid-cols-3 sm:p-5">
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-sm text-slate-600">{t('Records in this period')}</dt><dd className="mt-1 text-2xl font-bold text-slate-950">{number(result?.record_count||0)}</dd></div>
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-sm text-slate-600">{t('Parts with recorded sales')}</dt><dd className="mt-1 text-2xl font-bold text-slate-950">{number(result?.part_count||0)}</dd></div>
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-sm text-slate-600">{t('Latest recorded sale')}</dt><dd className="mt-1 text-lg font-bold text-slate-950">{day(result?.last_sale_date)}</dd></div>
      </dl>
      {result?.record_count>0?<>
        <div className="p-4 sm:px-5"><label className="label" htmlFor="recorded-part-search">{t('Find a recorded part')}</label><div className="relative"><Search size={18} aria-hidden="true" className="absolute left-3 top-3.5 text-slate-400" /><input id="recorded-part-search" className="input pl-10" type="search" value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}} /></div></div>
        {!visible.length?<p role="status" className="px-5 pb-5 text-sm text-slate-600">{t('No recorded parts match this search.')}</p>:<>
          <div className="divide-y divide-slate-100 lg:hidden">{visible.map(row=><article key={row.product_id} className="p-4 sm:p-5"><p className="font-semibold text-red-700">{row.part_number||t('No part number')}</p><h3 className="mt-1 font-semibold text-slate-950">{row.description||t('Part details unavailable')}</h3><dl className="mt-3 grid grid-cols-2 gap-3"><div><dt className="text-sm text-slate-500">{t('Quantity saved')}</dt><dd className="mt-1 font-bold">{number(row.recorded_quantity)}{row.unit?' '+row.unit:''}</dd></div><div><dt className="text-sm text-slate-500">{t('Sale days recorded')}</dt><dd className="mt-1 font-bold">{number(row.sale_days)}</dd></div><div className="col-span-2"><dt className="text-sm text-slate-500">{t('First and latest recorded sale')}</dt><dd className="mt-1 text-sm font-medium">{period(row)}</dd></div></dl><p className="mt-3 text-xs leading-5 text-slate-500">{t('Entered in PartCast: {v0} · Imported: {v1}',{v0:row.actual_records,v1:row.imported_records})}</p></article>)}</div>
          <div className="hidden overflow-x-auto lg:block"><table className="w-full text-left text-sm"><caption className="sr-only">{t('Sales by part')}</caption><thead className="bg-slate-50 text-slate-600"><tr><th scope="col" className="px-5 py-3">{t('Part')}</th><th scope="col" className="px-5 py-3 text-right">{t('Quantity saved')}</th><th scope="col" className="px-5 py-3 text-right">{t('Sale days recorded')}</th><th scope="col" className="px-5 py-3">{t('First and latest recorded sale')}</th></tr></thead><tbody className="divide-y divide-slate-100">{visible.map(row=><tr key={row.product_id}><th scope="row" className="px-5 py-4 font-normal"><p className="font-semibold text-slate-950">{row.part_number||t('No part number')}</p><p className="mt-1 text-slate-600">{row.description||t('Part details unavailable')}</p><p className="mt-2 text-xs text-slate-500">{t('Entered in PartCast: {v0} · Imported: {v1}',{v0:row.actual_records,v1:row.imported_records})}</p></th><td className="px-5 py-4 text-right font-semibold">{number(row.recorded_quantity)}{row.unit?' '+row.unit:''}</td><td className="px-5 py-4 text-right">{number(row.sale_days)}</td><td className="px-5 py-4">{period(row)}</td></tr>)}</tbody></table></div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4 sm:px-5"><p className="text-sm text-slate-600">{t('Showing {v0}–{v1} of {v2} parts.',{v0:(page-1)*pageSize+1,v1:Math.min(page*pageSize,filtered.length),v2:filtered.length})}</p><div className="flex gap-2"><button className="btn-secondary" disabled={page===1} onClick={()=>setPage(value=>value-1)}>{t('Previous parts')}</button><button className="btn-secondary" disabled={page*pageSize>=filtered.length} onClick={()=>setPage(value=>value+1)}>{t('Next parts')}</button></div></div>
        </>}
      </>:<div className="p-5 text-sm leading-6 text-slate-600"><p className="font-semibold text-slate-900">{t('No quantities were recorded in these dates.')}</p><p className="mt-1">{t('This does not mean there were no sales.')}</p></div>}
    </>}
  </section>;
}
