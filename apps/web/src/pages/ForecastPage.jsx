import useForecastAutomation from '../hooks/useForecastAutomation.js';
import useLiveRefresh from '../hooks/useLiveRefresh.js';
import {useLiveQuery} from '../hooks/useLiveQuery.js';
import {planningChart} from '../lib/planning.js';
import SearchSuggestions from '../components/SearchSuggestions.jsx';
import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BarChart3, CalendarDays, ChevronDown, ClipboardList, CircleCheck, Clock, LayoutDashboard, RefreshCw, TriangleAlert } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api.js';
import PageHeader from '../components/PageHeader.jsx';
import Loading from '../components/Loading.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Toast from '../components/Toast.jsx';
import ForecastAccuracy from '../components/ForecastAccuracy.jsx';
import ForecastStockSummary from '../components/ForecastStockSummary.jsx';
import ForecastDemo from '../components/ForecastDemo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
const units = value => Number(value || 0).toLocaleString(undefined, {
  maximumFractionDigits: 1
});
const day = value => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
  month: 'short',
  day: 'numeric'
}) : '—';
const time = value => value ? new Date(value).toLocaleString(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short'
}) : 'Not updated yet';
export default function ForecastPage({demo=false}) {
  useLocale();
  const {
    profile
  } = useAuth();
  const demoDatabase=profile?.data_environment==='simulated_demo';
  const canTrain = ['super_admin', 'owner', 'admin'].includes(profile?.role);
  const [params]=useSearchParams();
  const demoView=canTrain&&(demo||params.get('demo')==='1');
  const [runtime,setRuntime] = useState(null);
  const [runs, setRuns] = useState([]);
  const [quality, setQuality] = useState(null);
  const [forecastProducts, setForecastProducts] = useState([]);
  const [forecastRun, setForecastRun] = useState(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [savingHorizon,setSavingHorizon]=useState(false);
  const {data:automation,error:automationError,refresh:refreshAutomation}=useForecastAutomation(!demoView);
  useEffect(()=>{if(automation?.horizon_days)setHorizon(automation.horizon_days);},[automation?.horizon_days]);
  const [horizon, setHorizon] = useState(30);
  const [view, setView] = useState('chart');
  const [toast, setToast] = useState(null);
  const readiness=automation?.status==='waiting_history'?{ready:false}:null;
  const loadRequest=useRef(0);
  async function load(background=false) {
    const request=++loadRequest.current;
    if(!background)setLoading(true);
    setLoadError('');
    try {
      const [r, q, fp] = await Promise.all([api.get('/api/forecast/runs'), api.get('/api/data-quality'), api.get('/api/forecast/products')]);
      if(request!==loadRequest.current)return;
      setRuns(r.data || []);
      setQuality(q);
      setForecastProducts(fp.data || []);
      setForecastRun(fp.run || null);
      setSelected(current => fp.data?.some(p => p.product_id === current) ? current : fp.data?.[0]?.product_id || '');
    } catch (error) {
      if(request===loadRequest.current)setLoadError(error.message);
    } finally {
      if(request===loadRequest.current)setLoading(false);
    }
  }
  useEffect(() => {
    if(demoView)return;
    load();
    api.get('/api/forecast/status').then(setRuntime).catch(e=>setRuntime({ready:false,message:e.message}));
    return()=>{loadRequest.current++;};
  }, [demoView]);
  useLiveRefresh(()=>{if(!demoView){load(true);}},['products','demand_observations','forecast_runs','legacy_sales','import_batches'],!demoView);
  const {data:planning,loading:loadingPart,error:partError}=useLiveQuery(signal=>!demoView&&selected?api.get(`/api/forecast/product/${selected}`,{signal}):Promise.resolve(null),[selected,forecastRun?.id,demoView],['products','demand_observations','forecast_runs']);
  const forecast=(planning?.data||[]).filter(row=>!planning?.run?.id||row.run_id===planning.run.id);
  const chart=useMemo(()=>planningChart(planning),[planning]);
  const filtered = useMemo(() => forecastProducts.filter(p => `${p.part_number || ''} ${p.description}`.toLowerCase().includes(query.toLowerCase())), [forecastProducts, query]);
  const selectedProduct = forecastProducts.find(p => p.product_id === selected);
  const displayedTotal=planning?forecast.reduce((total,row)=>total+Number(row.predicted_quantity),0):selectedProduct?.predicted_total;
  const latest = runs.find(r => r.status === 'completed');
  const metrics = latest?.metrics;
  const usedImported=metrics?.source_counts?.imported_training_data??quality?.importedTrainingRows??0;
  const usedCounter=metrics?.source_counts?.actual_sale??quality?.actualDemandRows??0;
  const needsData = !Number(quality?.importedTrainingRows || 0) && !Number(quality?.actualDemandRows || 0)&&!Number(quality?.demoDemandRows||0);
  const estimatesExpired = Boolean(latest && !forecastProducts.some(p=>p.forecast_days>0));
  async function changeHorizon(value){
    const previous=horizon;setHorizon(Number(value));setSavingHorizon(true);
    try{await api.post('/api/forecast/automation',{horizonDays:Number(value)});await refreshAutomation();}
    catch(error){setHorizon(previous);setToast({type:'error',message:error.message});}
    finally{setSavingHorizon(false);}
  }
  const automaticMessage=automationError ? automationError : automation?.status==='training' ? 'Updating estimates…' : automation?.status==='queued' ? 'New sales saved. Updating shortly…' : automation?.status==='waiting_history' ? 'More sales history is needed.' : automation?.status==='error' ? 'Update delayed. Retrying automatically.' : automation?.status==='ready' ? 'Updates automatically' : 'Checking for updates…';
  const estimateNeedsReview=Boolean(metrics&&metrics.horizon_validation?.status!=='improvement_observed');
  const guide=<>
    <section><h3>{t('Review a part')}</h3><ol><li>{t('Search for a part or choose it from the list.')}</li><li>{t('Choose Chart, Daily list or Summary to review its demand and stock.')}</li><li>{t('Check the recommendation and your shelves before ordering.')}</li></ol></section>
    <section><h3>{t('Automatic updates')}</h3><p>{t('Sales and stock update automatically. New demand estimates appear when calculations finish.')}</p><p>{t('Changing the planning period automatically recalculates the estimates.')}</p></section>
    <section><h3>{t('Reading estimates')}</h3><p>{t('Daily estimates are averages. For example, 0.7 a day means about 7 units over 10 days. Some days may have no sales.')}</p><p>{t('XGBoost estimates the whole planning period directly. The chart spreads that total into expected daily averages; it does not predict exact sale dates.')}</p><p>{t('Projected stock assumes no future deliveries.')}</p></section>
    <section><h3>{t('Before ordering')}</h3><p>{t('Estimates use saved sales. Check your shelves before ordering.')}</p><p>{t('Open Sales data and update history to check the records and forecast quality.')}</p>{demoDatabase&&<p>{t('This walkthrough estimates demand from generated quantities in your separate demo database. Its results do not measure actual-store accuracy.')}</p>}</section>
  </>;

  if(demoView)return <><PageHeader title={t('Practice demand forecasting')} subtitle={t('Run XGBoost on a separate sample, then inspect its errors and estimates.')} /><Link className="btn-secondary mb-5" to="/forecast">{t('Back to demand planning')}</Link><ForecastDemo initiallyOpen /></>;
  if (loading) return <Loading label={t("Loading sales estimates…")} />;
  return <>
    <PageHeader title={t("Plan ahead")} help={guide} actions={<Link className="btn-secondary" to="/reorder">{t("View restock list ")}<ArrowRight size={17} /></Link>} />

    {loadError && <div role="alert" className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-amber-950">{t("We could not load your sales estimates.")}</p><p className="mt-1 text-sm text-amber-900">{t(loadError)}</p></div><button className="btn-secondary shrink-0" onClick={load}><RefreshCw size={16} />{t("Try again")}</button></div>}

    {runtime?.ready===false && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert"><p className="font-bold">{t("The forecasting engine needs attention")}</p><p className="mt-2">{t(runtime.message)}</p><button className="btn-secondary mt-3" onClick={()=>api.get('/api/forecast/status').then(setRuntime).catch(e=>setRuntime({ready:false,message:e.message}))}>{t("Check again")}</button></div>}
    <section className="panel mb-5 flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5" aria-label={t('Planning updates')}>
      <div className="min-w-0"><p className={`flex items-start gap-2 text-sm font-semibold ${automationError||automation?.status==='error'?'text-amber-800':'text-slate-700'}`} role={automationError?'alert':'status'}>{automation?.status==='ready'?<CircleCheck size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true"/>:<Clock size={18} className="mt-0.5 shrink-0" aria-hidden="true"/>}<span>{t(automaticMessage)}</span></p><p className="mt-1 text-xs text-slate-500">{t('Last completed update: ')}{time(latest?.completed_at||latest?.started_at)}</p></div>
      {canTrain&&<div className="w-full sm:w-auto sm:min-w-48"><label className="label text-sm" htmlFor="planning-days">{t('Planning period')}</label><select id="planning-days" className="input" value={horizon} onChange={event=>changeHorizon(event.target.value)} disabled={savingHorizon}><option value="14">{t('Next 14 days')}</option><option value="30">{t('Next 30 days')}</option><option value="60">{t('Next 60 days')}</option><option value="90">{t('Next 90 days')}</option></select></div>}
    </section>
    {demoDatabase&&<p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{t('Practice data — not actual store sales')}</p>}

    {(metrics?.coverage_warning || metrics?.stale_product_count > 0) && <section className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5"><TriangleAlert size={21} className="mt-0.5 shrink-0 text-amber-700" /><div><h2 className="font-bold text-amber-950">{demoDatabase?t('Sample forecast limitations'):t("Check your sales history before ordering")}</h2>{metrics.coverage_warning && <p className="mt-1 text-sm leading-6 text-amber-900">{demoDatabase?t('These errors describe generated demand only. They do not establish accuracy for the actual store.'):t("Some imported sales may be missing. Record every sale so the estimate reflects what customers actually buy.")}</p>}{metrics.stale_product_count > 0 && <p className="mt-1 text-sm leading-6 text-amber-900">{t('{v0} parts need more recent sales history.',{v0:metrics.stale_product_count})}</p>}</div></section>}

    <section className="panel mt-5">
      <div className="panel-header"><div><h2 className="text-lg font-bold text-slate-950">{t("Look up a part")}</h2></div>{forecastProducts.length > 0 && <div className="flex max-w-full flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label={t("Estimate display")}><button className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${view === 'chart' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-600'}`} onClick={() => setView('chart')} aria-pressed={view === 'chart'}><BarChart3 size={16} />{t("Chart")}</button><button className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${view === 'list' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-600'}`} onClick={() => setView('list')} aria-pressed={view === 'list'}><ClipboardList size={16} />{t("Daily list")}</button><button className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${view === 'summary' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-600'}`} onClick={() => setView('summary')} aria-pressed={view === 'summary'}><LayoutDashboard size={16} />{t('Summary')}</button></div>}</div>
      {forecastProducts.length > 0 ? <>
        <div className="grid gap-4 border-b border-slate-100 p-4 sm:p-5 lg:grid-cols-2"><div><label className="label" htmlFor="forecast-part-search">{t("Search by part number or name")}</label><div className="relative"><SearchSuggestions id="forecast-part-search" label={t('Search by part number or name')} placeholder={t('For example: brake pad')} value={query} onChange={setQuery} items={filtered.slice(0,10).map(p=>({id:p.product_id,label:t(p.description),description:p.part_number}))} onSelect={item=>{setSelected(item.id);setQuery('');}} /></div></div><div><label className="label" htmlFor="forecast-part-choice">{t("Choose a part")}</label><select id="forecast-part-choice" className="input" value={filtered.some(p => p.product_id === selected) ? selected : ''} onChange={event => setSelected(event.target.value)}><option value="" disabled>{filtered.length ? t('Select a part from the list') : t('No matching parts')}</option>{filtered.map(p => <option key={p.product_id} value={p.product_id}>{p.part_number || t('No part number')} · {t(p.description)}</option>)}</select></div>{query && !filtered.length && <p className="text-sm text-slate-600 lg:col-span-2" role="status">{t("No estimated parts match \u201C")}{query}{t("\u201D. Try another part number or clear your search.")}</p>}</div>
        {view!=='summary'&&selectedProduct && <div className="border-b border-slate-100 bg-slate-50 px-4 py-4 sm:px-5"><p className="text-sm font-semibold text-red-700">{selectedProduct.part_number || t('No part number')}</p><h3 className="mt-1 text-lg font-bold text-slate-950">{t(selectedProduct.description)}</h3><p className="mt-2 text-sm font-semibold text-emerald-800">{t("On hand")}: {Number(planning?.product?.current_stock ?? selectedProduct.current_stock ?? 0).toLocaleString()} {t("units")}</p><p className="mt-2 text-sm text-slate-600"><strong className="text-slate-900">{t("About ")}{units(displayedTotal)}{t(" units")}</strong>{t(" estimated across ")}{planning?forecast.length:selectedProduct.forecast_days}{t(" upcoming days.")}</p></div>}

        {loadingPart ? <Loading label={t("Loading this part’s estimate…")} /> : partError ? <div role="alert" className="p-5 text-sm text-amber-900">{t("This part\u2019s estimate could not be loaded. ")}{partError}<button className="btn-secondary mt-3 block" onClick={load}>{t("Try again")}</button></div> : view==='summary'&&selectedProduct?<ForecastStockSummary product={{...selectedProduct,predicted_total:forecast.reduce((total,row)=>total+Number(row.predicted_quantity),0),forecast_days:forecast.length}} stock={planning?.product?.current_stock??null}/>:planning ? <>
          {view === 'chart' ? <><p className="px-4 pt-5 text-sm text-slate-600 sm:px-5">{t("Actual sales, estimated demand and projected stock")}</p><div className="h-[300px] px-2 pb-2 pt-5 sm:h-[360px] sm:px-5" role="img" aria-label={t("Estimated daily sales for {v0}. Use Daily list to read the values.", {
              v0: selectedProduct?.description || t('the selected part')
            })}><ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{
                  top: 8,
                  right: 20,
                  bottom: 8,
                  left: 0
                }}><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{
                    fontSize: 14,
                    fill: '#475569'
                  }} tickFormatter={day} minTickGap={30} /><YAxis width={40} tick={{
                    fontSize: 14,
                    fill: '#475569'
                  }} /><Tooltip labelFormatter={day} formatter={(value,name) => [units(value), name]} contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #e2e8f0'
                  }} /><Legend/><Line name={t("Actual sales")} type="linear" dataKey="actual_quantity" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false}/><Line name={t("Predicted demand")} type="monotone" dataKey="predicted_quantity" stroke="#dc2626" strokeWidth={3} dot={false} isAnimationActive={false}/><Line name={t("Projected stock")} type="linear" dataKey="projected_stock" stroke="#059669" strokeWidth={2} dot={{r:2}} isAnimationActive={false}/></LineChart></ResponsiveContainer></div></> : <div className="max-h-[380px] overflow-y-auto"><table className="w-full text-left text-sm"><caption className="sr-only">{t("Daily sales estimates for ")}{selectedProduct?.description}</caption><thead className="sticky top-0 bg-slate-50 text-slate-600"><tr><th scope="col" className="px-5 py-3 font-semibold">{t("Date")}</th><th scope="col" className="px-5 py-3 text-right font-semibold">{t("Estimated units sold")}</th></tr></thead><tbody className="divide-y divide-slate-100">{forecast.map(row => <tr key={`${row.run_id}-${row.forecast_date}`}><td className="px-5 py-3">{day(row.forecast_date)}</td><td className="px-5 py-3 text-right font-semibold">{units(row.predicted_quantity)}</td></tr>)}</tbody></table></div>}

        </> : <div className="p-8 text-center text-sm text-slate-600">{t("No upcoming daily estimates are available for this part. They will appear automatically when enough recent sales are available.")}</div>}
      </> : <div className="px-4 py-6 sm:px-6"><div className="mx-auto max-w-lg text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-700"><CalendarDays size={26} /></div><h3 className="mt-4 text-lg font-bold text-slate-950">{needsData ? t('Start with your sales history') : estimatesExpired ? t('No current estimates to show') : t('Your first estimate is not ready yet')}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{needsData ? t('Record actual sales in PartCast or import a prepared sales spreadsheet. Estimates update automatically when enough recent history is available.') : readiness?.ready===false ? t('Keep recording sales. More recent history is needed before estimates can be updated.') : t('Estimates update automatically using recent sales. Parts without enough recent history will be left out.')}</p><Link className="btn-secondary mt-5" to="/sales">{t('View sales')}</Link></div></div>}
    </section>


    <details className="panel mt-5 overflow-hidden"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-5 font-semibold text-slate-900"><span>{t("Sales data and update history ")}</span>{estimateNeedsReview&&<span className="ml-auto rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800">{t('Forecast needs review')}</span>}<ChevronDown size={19} aria-hidden="true" /></summary><div className="border-t border-slate-100 p-5"><div className="panel mt-4 grid grid-cols-3 divide-x divide-slate-200">
      <div className="min-w-0 p-3 sm:p-4"><p className="text-sm font-medium text-slate-600">{t("Parts estimated")}</p><p className="mt-2 text-2xl font-bold text-slate-950">{forecastProducts.filter(p=>p.forecast_days>0).length.toLocaleString()}</p></div>
      <div className="min-w-0 p-3 sm:p-4"><p className="text-sm font-medium text-slate-600">{demoDatabase?t('Demo demand records'):t("Counter sales")}</p><p className="mt-2 text-2xl font-bold text-slate-950">{Number(demoDatabase?quality?.demoDemandRows||0:usedCounter).toLocaleString()}</p></div>
      <div className="min-w-0 p-3 sm:p-4"><p className="text-sm font-medium text-slate-600">{demoDatabase?t('Days in sample history'):t("Imported history")}</p><p className="mt-2 text-2xl font-bold text-slate-950">{Number(demoDatabase?quality?.demoHistoryDays||0:usedImported).toLocaleString()}</p></div>
    </div><ForecastAccuracy metrics={metrics}/><div className="mt-5 grid gap-5 lg:grid-cols-2"><div><h2 className="font-bold text-slate-950">{t("What records are being used?")}</h2><dl className="mt-3 space-y-3 text-sm"><div className="flex items-start justify-between gap-4"><dt className="text-slate-600">{demoDatabase?t('Demo demand records'):t("Imported sales history")}</dt><dd className="font-semibold">{Number(demoDatabase?quality?.demoDemandRows||0:usedImported).toLocaleString()}</dd></div><div className="flex items-start justify-between gap-4"><dt className="text-slate-600">{t("Old sales rows")}</dt><dd className="font-semibold">{Number(quality?.legacySalesRows || 0).toLocaleString()}</dd></div><div className="flex items-start justify-between gap-4"><dt className="text-slate-600">{t("Old sales not matched to a part")}</dt><dd className="font-semibold">{Number(quality?.unmatchedLegacySales || 0).toLocaleString()}</dd></div></dl><p className="mt-3 text-sm leading-6 text-slate-500">{t("Unmatched sales cannot help estimate a specific part\u2019s demand. Ask your manager to check the imported part numbers.")}</p></div><div><h2 className="font-bold text-slate-950">{t("Recent updates")}</h2><div className="mt-3 divide-y divide-slate-100">{runs.length ? runs.slice(0, 8).map(run => { const checked=run.metrics?.horizon_validation?.model; return <div className="py-3 first:pt-0" key={run.id}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-900">{time(run.started_at)}</p><StatusBadge status={run.status} /></div><p className="mt-1 text-sm text-slate-500">{Number(run.training_rows || 0).toLocaleString()}{t(" past records \xB7 ")}{Number(run.product_count || 0).toLocaleString()}{t(" parts \xB7 ")}{run.horizon_days || '—'}{t(" days ahead")}</p>{run.metrics && <details className="mt-2 text-sm"><summary className="cursor-pointer text-slate-600">{t('{v0}-day historical test results',{v0:run.horizon_days})}</summary><dl className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3"><div><dt className="text-slate-500">{t("Average error (MAE)")}</dt><dd>{checked?.mae ?? '—'}{t(" units")}</dd></div><div><dt className="text-slate-500">{t("Larger-error measure (RMSE)")}</dt><dd>{checked?.rmse ?? '—'}{t(" units")}</dd></div><div><dt className="text-slate-500">{t("Fit score (R\xB2)")}</dt><dd>{checked?.r2 ?? '—'}</dd></div><div><dt className="text-slate-500">{t("Overall error (WAPE)")}</dt><dd>{checked?.wape_percent==null?t('Not measurable'):checked.wape_percent+'%'}</dd></div></dl></details>}</div>;}) : <p className="text-sm leading-6 text-slate-500">{t("No estimates have been calculated yet. Keep recording sales; estimates will appear automatically when enough history is available.")}</p>}</div></div></div></div></details>
    <Toast toast={toast} onClose={() => setToast(null)} />
  </>;
}
