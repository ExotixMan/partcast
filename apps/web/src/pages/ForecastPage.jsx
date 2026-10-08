import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BarChart3, CalendarDays, ChevronDown, ClipboardList, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api.js';
import PageHeader from '../components/PageHeader.jsx';
import Loading from '../components/Loading.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Toast from '../components/Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const units = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
const day = value => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
const time = value => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not updated yet';

export default function ForecastPage() {
  const { profile } = useAuth();
  const canTrain = ['owner', 'admin'].includes(profile?.role);
  const [runs, setRuns] = useState([]);
  const [quality, setQuality] = useState(null);
  const [forecastProducts, setForecastProducts] = useState([]);
  const [forecastRun, setForecastRun] = useState(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [forecast, setForecast] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingPart, setLoadingPart] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [partError, setPartError] = useState('');
  const [training, setTraining] = useState(false);
  const [includeProxy, setIncludeProxy] = useState(false);
  const [horizon, setHorizon] = useState(30);
  const [view, setView] = useState('chart');
  const [toast, setToast] = useState(null);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const [r, q, fp] = await Promise.all([api.get('/api/forecast/runs'), api.get('/api/data-quality'), api.get('/api/forecast/products')]);
      setRuns(r.data || []);
      setQuality(q);
      setForecastProducts(fp.data || []);
      setForecastRun(fp.run || null);
      setSelected(current => fp.data?.some(p => p.product_id === current) ? current : fp.data?.[0]?.product_id || '');
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    let active = true;
    setForecast([]);
    setPartError('');
    if (!selected) { setLoadingPart(false); return; }
    setLoadingPart(true);
    api.get(`/api/forecast/product/${selected}`).then(result => {
      if (active) setForecast((result.data || []).filter(row => !forecastRun?.id || row.run_id === forecastRun.id));
    }).catch(error => { if (active) setPartError(error.message); }).finally(() => { if (active) setLoadingPart(false); });
    return () => { active = false; };
  }, [selected, forecastRun?.id, runs]);

  const filtered = useMemo(() => forecastProducts.filter(p => `${p.part_number || ''} ${p.description}`.toLowerCase().includes(query.toLowerCase())), [forecastProducts, query]);
  const selectedProduct = forecastProducts.find(p => p.product_id === selected);
  const latest = runs.find(r => r.status === 'completed');
  const metrics = latest?.metrics;
  const needsData = !Number(quality?.importedTrainingRows || 0) && !Number(quality?.actualDemandRows || 0);
  const estimatesExpired = Boolean(latest && !forecastProducts.length);

  async function train() {
    setTraining(true);
    try {
      const result = await api.post('/api/forecast/train', { horizonDays: Number(horizon), includeProxy });
      setToast({ message: `Demand estimate updated. ${Number(result.forecastCount || 0).toLocaleString()} daily estimates are ready to review.` });
      await load();
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setTraining(false);
    }
  }

  if (loading) return <Loading label="Loading sales estimates…" />;

  return <>
    <PageHeader title="Plan ahead" subtitle="See which parts customers may need next, then decide what to restock." actions={<Link className="btn-secondary" to="/reorder">View restock list <ArrowRight size={17} /></Link>} />

    {loadError && <div role="alert" className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-amber-950">We could not load your sales estimates.</p><p className="mt-1 text-sm text-amber-900">{loadError}</p></div><button className="btn-secondary shrink-0" onClick={load}><RefreshCw size={16} />Try again</button></div>}

    <section className="panel p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xl"><div className="mb-3 inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700"><CalendarDays size={16} />Sales estimates</div><h2 className="text-lg font-bold text-slate-950">A guide for your next stock order</h2><p className="mt-2 text-sm leading-6 text-slate-600">PartCast uses recorded sales and imported sales history to estimate demand. Check your shelves and recent sales before ordering. Estimates are not guaranteed sales.</p><p className="mt-3 text-sm text-slate-500">Last completed update: <span className="font-medium text-slate-700">{time(latest?.completed_at || latest?.started_at)}</span></p></div>
        {canTrain ? <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 lg:max-w-sm"><label className="label" htmlFor="planning-days">How far ahead do you want to plan?</label><select id="planning-days" className="input" value={horizon} onChange={event => setHorizon(event.target.value)} disabled={training}><option value="14">Next 14 days</option><option value="30">Next 30 days</option><option value="60">Next 60 days</option><option value="90">Next 90 days</option></select><button className="btn-primary mt-3 w-full" disabled={training || Boolean(loadError)} onClick={train}><RefreshCw size={17} className={training ? 'animate-spin' : ''} />{training ? 'Updating estimates…' : 'Update demand estimate'}</button><p className="mt-2 text-xs leading-5 text-slate-500">Uses the sales records already saved in PartCast. This can take a moment.</p></div> : <div className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600 lg:max-w-xs">Your store manager can update these estimates. You can review the available results below.</div>}
      </div>
    </section>

    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <div className="panel p-4 sm:p-5"><p className="text-sm font-medium text-slate-600">Parts with current estimates</p><p className="mt-2 text-3xl font-bold text-slate-950">{forecastProducts.length.toLocaleString()}</p><p className="mt-1 text-sm text-slate-500">From the latest completed update</p></div>
      <div className="panel p-4 sm:p-5"><p className="text-sm font-medium text-slate-600">Sales records saved</p><p className="mt-2 text-3xl font-bold text-slate-950">{Number(quality?.actualDemandRows || 0).toLocaleString()}</p><p className="mt-1 text-sm text-slate-500">Actual demand recorded in PartCast</p></div>
      <div className="panel p-4 sm:p-5"><p className="text-sm font-medium text-slate-600">Imported history records</p><p className="mt-2 text-3xl font-bold text-slate-950">{Number(quality?.importedTrainingRows || 0).toLocaleString()}</p><p className="mt-1 text-sm text-slate-500">Prepared sales data used for planning</p></div>
    </div>

    {(metrics?.coverage_warning || metrics?.stale_product_count > 0) && <section className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5"><TriangleAlert size={21} className="mt-0.5 shrink-0 text-amber-700" /><div><h2 className="font-bold text-amber-950">Check your sales history before ordering</h2>{metrics.coverage_warning && <p className="mt-1 text-sm leading-6 text-amber-900">Some imported sales may be missing. Record every sale so the estimate reflects what customers actually buy.</p>}{metrics.stale_product_count > 0 && <p className="mt-1 text-sm leading-6 text-amber-900">{metrics.stale_product_count} parts were left out because their latest usable sales records are more than 31 days old. Add recent sales records, then update the estimates.</p>}</div></section>}

    <section className="panel mt-5 overflow-hidden">
      <div className="panel-header"><div><h2 className="text-lg font-bold text-slate-950">Look up a part</h2><p className="mt-1 text-sm text-slate-600">Choose a part to see its estimated daily sales.</p></div>{forecastProducts.length > 0 && <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Estimate display"><button className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${view === 'chart' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-600'}`} onClick={() => setView('chart')} aria-pressed={view === 'chart'}><BarChart3 size={16} />Chart</button><button className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${view === 'list' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-600'}`} onClick={() => setView('list')} aria-pressed={view === 'list'}><ClipboardList size={16} />Daily list</button></div>}</div>
      {forecastProducts.length > 0 ? <>
        <div className="grid gap-4 border-b border-slate-100 p-4 sm:p-5 lg:grid-cols-2"><div><label className="label" htmlFor="forecast-part-search">Search by part number or name</label><div className="relative"><Search size={18} aria-hidden="true" className="absolute left-3 top-3.5 text-slate-400" /><input id="forecast-part-search" className="input pl-10" type="search" placeholder="For example: brake pad" value={query} onChange={event => setQuery(event.target.value)} /></div></div><div><label className="label" htmlFor="forecast-part-choice">Choose a part</label><select id="forecast-part-choice" className="input" value={filtered.some(p => p.product_id === selected) ? selected : ''} onChange={event => setSelected(event.target.value)}><option value="" disabled>{filtered.length ? 'Select a part from the list' : 'No matching parts'}</option>{filtered.map(p => <option key={p.product_id} value={p.product_id}>{p.part_number || 'No part number'} · {p.description}</option>)}</select></div>{query && !filtered.length && <p className="text-sm text-slate-600 lg:col-span-2" role="status">No estimated parts match “{query}”. Try another part number or clear your search.</p>}</div>
        {selectedProduct && <div className="border-b border-slate-100 bg-slate-50 px-4 py-4 sm:px-5"><p className="text-sm font-semibold text-red-700">{selectedProduct.part_number || 'No part number'}</p><h3 className="mt-1 text-lg font-bold text-slate-950">{selectedProduct.description}</h3><p className="mt-2 text-sm text-slate-600"><strong className="text-slate-900">About {units(selectedProduct.predicted_total)} units</strong> estimated across {selectedProduct.forecast_days} upcoming days.</p></div>}
        {loadingPart ? <Loading label="Loading this part’s estimate…" /> : partError ? <div role="alert" className="p-5 text-sm text-amber-900">This part’s estimate could not be loaded. {partError}<button className="btn-secondary mt-3 block" onClick={load}>Try again</button></div> : forecast.length ? <>
          {view === 'chart' ? <><p className="px-4 pt-5 text-sm text-slate-600 sm:px-5">Estimated units customers may buy each day</p><div className="h-[300px] px-2 pb-2 pt-5 sm:h-[360px] sm:px-5" role="img" aria-label={`Estimated daily sales for ${selectedProduct?.description || 'the selected part'}. Use Daily list to read the values.`}><ResponsiveContainer width="100%" height="100%"><LineChart data={forecast} margin={{ top: 8, right: 20, bottom: 8, left: 0 }}><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="forecast_date" tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={day} minTickGap={30} /><YAxis width={40} tick={{ fontSize: 12, fill: '#64748b' }} /><Tooltip labelFormatter={day} formatter={value => [units(value), 'Estimated units']} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} /><Line type="monotone" dataKey="predicted_quantity" stroke="#dc2626" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></div></> : <div className="max-h-[380px] overflow-y-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Daily sales estimates for {selectedProduct?.description}</caption><thead className="sticky top-0 bg-slate-50 text-slate-600"><tr><th scope="col" className="px-5 py-3 font-semibold">Date</th><th scope="col" className="px-5 py-3 text-right font-semibold">Estimated units sold</th></tr></thead><tbody className="divide-y divide-slate-100">{forecast.map(row => <tr key={`${row.run_id}-${row.forecast_date}`}><td className="px-5 py-3">{day(row.forecast_date)}</td><td className="px-5 py-3 text-right font-semibold">{units(row.predicted_quantity)}</td></tr>)}</tbody></table></div>}
          <p className="border-t border-slate-100 px-4 py-4 text-sm leading-6 text-slate-500 sm:px-5">A value below 1 means the part may sell occasionally, rather than every day. Use the period total to help plan your order.</p>
        </> : <div className="p-8 text-center text-sm text-slate-600">No upcoming daily estimates are available for this part. Ask your store manager to update the demand estimate.</div>}
      </> : <div className="px-5 py-10 sm:px-8"><div className="mx-auto max-w-lg text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-700"><CalendarDays size={26} /></div><h3 className="mt-4 text-lg font-bold text-slate-950">{needsData ? 'Start with your sales history' : estimatesExpired ? 'No current estimates to show' : 'Your first estimate is not ready yet'}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{needsData ? 'Record actual sales in PartCast or ask your manager to import a prepared sales spreadsheet. Then update the demand estimate.' : 'Update the demand estimate using recent sales. Parts without enough recent history will be left out.'}</p><div className="mt-5 rounded-xl bg-slate-50 p-4 text-left"><p className="text-sm font-semibold text-slate-900">For each part, PartCast needs:</p><ul className="mt-2 space-y-2 text-sm text-slate-600"><li>At least 5 days with recorded sales</li><li>At least 35 days of sales history</li><li>A usable sale record from the last 31 days</li></ul></div><p className="mt-4 text-sm leading-6 text-slate-500">Keep recording every sale. Missing entries can make demand appear lower than it really is.{!canTrain && ' Ask your store manager to run the update.'}</p></div></div>}
    </section>

    {metrics && <section className="panel mt-5 p-5 sm:p-6"><h2 className="text-lg font-bold text-slate-950">How dependable is this estimate?</h2><p className="mt-2 text-sm leading-6 text-slate-600">When checked against recent days kept aside for testing, the estimate differed from actual sales by about <strong className="text-slate-900">{units(metrics.mae)} units per part per day</strong>. This checks next-day accuracy on the available records, not accuracy across the full planning period.</p>{metrics.baseline_mae != null && <p className="mt-3 text-sm leading-6 text-slate-600">A simple recent-sales average differed by {units(metrics.baseline_mae)} units. {metrics.mae < metrics.baseline_mae ? 'This estimate performed better in that comparison.' : 'This estimate did not improve on the simple average. Use extra care when deciding what to order.'}</p>}</section>}

    <details className="panel mt-5 overflow-hidden"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-5 font-semibold text-slate-900">Sales data and update history <ChevronDown size={19} aria-hidden="true" /></summary><div className="border-t border-slate-100 p-5"><div className="grid gap-5 lg:grid-cols-2"><div><h2 className="font-bold text-slate-950">What records are being used?</h2><dl className="mt-3 space-y-3 text-sm"><div className="flex items-start justify-between gap-4"><dt className="text-slate-600">Imported sales history</dt><dd className="font-semibold">{Number(quality?.importedTrainingRows || 0).toLocaleString()}</dd></div><div className="flex items-start justify-between gap-4"><dt className="text-slate-600">Old sales rows</dt><dd className="font-semibold">{Number(quality?.legacySalesRows || 0).toLocaleString()}</dd></div><div className="flex items-start justify-between gap-4"><dt className="text-slate-600">Old sales not matched to a part</dt><dd className="font-semibold">{Number(quality?.unmatchedLegacySales || 0).toLocaleString()}</dd></div><div className="flex items-start justify-between gap-4"><dt className="text-slate-600">Old transaction-count estimates</dt><dd className="font-semibold">{Number(quality?.proxyDemandRows || 0).toLocaleString()}</dd></div></dl><p className="mt-3 text-sm leading-6 text-slate-500">Unmatched sales cannot help estimate a specific part’s demand. Ask your manager to check the imported part numbers.</p>{canTrain && <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-red-600" checked={includeProxy} disabled={training} onChange={event => setIncludeProxy(event.target.checked)} /><span><span className="block text-sm font-semibold text-amber-950">Include old transaction-count estimates</span><span className="mt-1 block text-sm leading-6 text-amber-900">Optional: treats an old transaction as 1 unit when its actual quantity is unknown. This can reduce accuracy. Your prepared sales spreadsheet is already included without this option.</span></span></label>}</div><div><h2 className="font-bold text-slate-950">Recent updates</h2><div className="mt-3 divide-y divide-slate-100">{runs.length ? runs.slice(0, 8).map(run => <div className="py-3 first:pt-0" key={run.id}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-900">{time(run.started_at)}</p><StatusBadge status={run.status} /></div><p className="mt-1 text-sm text-slate-500">{Number(run.training_rows || 0).toLocaleString()} past records · {Number(run.product_count || 0).toLocaleString()} parts · {run.horizon_days || '—'} days ahead</p>{run.metrics && <details className="mt-2 text-sm"><summary className="cursor-pointer text-slate-600">Technical accuracy details</summary><dl className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3"><div><dt className="text-slate-500">Average error (MAE)</dt><dd>{run.metrics.mae ?? '—'} units</dd></div><div><dt className="text-slate-500">Larger-error measure (RMSE)</dt><dd>{run.metrics.rmse ?? '—'} units</dd></div><div><dt className="text-slate-500">Fit score (R²)</dt><dd>{run.metrics.r2 ?? '—'}</dd></div><div><dt className="text-slate-500">Overall error (WAPE)</dt><dd>{run.metrics.wape_percent ?? '—'}%</dd></div></dl></details>}</div>) : <p className="text-sm leading-6 text-slate-500">No estimates have been calculated yet. Add recent sales history, then ask your manager to update the estimate.</p>}</div></div></div></div></details>
    <Toast toast={toast} onClose={() => setToast(null)} />
  </>;
}
