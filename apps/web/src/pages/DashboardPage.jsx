import ProductSearch from '../components/ProductSearch.jsx';
import useLiveRefresh from '../hooks/useLiveRefresh.js';
import Form from '../components/Form.jsx';
import { t, useLocale } from "../context/LocaleContext.jsx";
import {suggestedQuantity} from '../lib/restock.js';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { canOpenPage } from '../lib/access.js';
import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, ArrowRight, ChevronDown, Boxes, ChartNoAxesCombined, CheckCircle2, CircleDollarSign, PackageX, RefreshCw, Search, ShoppingCart } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api.js';
import Loading from '../components/Loading.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import './dashboard.css';
const peso = value => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2
}).format(Number(value || 0));
const actions = [{
  to: '/counter',
  title: 'Record a sale',
  icon: ShoppingCart,
  tone: 'red'
}, {
  to: '/counter?mode=stock_in',
  title: 'Receive stock',
  icon: ArrowDownToLine,
  tone: 'emerald'
}];
const tones = {
  red: 'bg-red-50 text-red-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-800'
};
export default function DashboardPage() {
  useLocale();
  const {
    profile
  } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState('');
  const load = async (background=false) => {
    if(!background)setBusy(true);
    setError('');
    try {
      setData(await api.get('/api/dashboard'));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  useLiveRefresh(load,['products','inventory_transactions','legacy_sales','forecast_runs','product_suppliers','suppliers']);
  const metrics = data?.metrics || {};
  const attention = Number(metrics.lowStock || 0) + Number(metrics.outOfStock || 0);
  const restock = data?.reorder || [];
  const availableActions = actions.filter(action => canOpenPage(profile?.role, action.to.split('?')[0]));
  const salesTrend = data?.salesTrend || [];
  const salesTotal = salesTrend.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
  return <div className="home-page">
    <PageHeader title={t("Hello, {v0}", {
      v0: profile?.full_name?.split(' ')[0] || t('welcome')
    })} actions={<button className="btn-secondary" onClick={load} disabled={busy}><RefreshCw size={17} className={busy ? 'animate-spin' : ''} aria-hidden="true" />{busy ? t('Updating…') : t('Refresh overview')}</button>} />
    {data?.offline && <p role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t("This overview was saved ")}{new Date(data.savedAt).toLocaleString()}{t(". Inventory includes your waiting changes; these totals update after they are sent.")}</p>}
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{t(error)}</div>}
    {!data && !error && <Loading label={t('Getting your store overview…')} />}
    {data && <section className="mb-6 min-w-0" aria-labelledby="overview-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="overview-heading" className="flex items-center gap-2 text-xl font-bold text-slate-900"><ChartNoAxesCombined size={23} className="shrink-0 text-red-700" aria-hidden="true" />{t('Store overview')}</h2>
        <Link to="/inventory" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4"><Boxes size={18} className="shrink-0" aria-hidden="true" /><span>{t('Parts in inventory')}: {Number(metrics.totalProducts || 0).toLocaleString()}</span><ArrowRight size={16} className="shrink-0" aria-hidden="true" /></Link>
      </div>
      <div className="home-summary-stats mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard to="/sales" label={t('Recorded sales')} value={Number.isFinite(salesTotal) ? peso(salesTotal) : '—'} icon={CircleDollarSign} tone="emerald" note="Sales over the last 30 days" />
        <StatCard label={t('Stock value')} value={peso(metrics.inventoryValue)} icon={Boxes} note="Based on your recorded costs" />
        <StatCard to="/inventory?status=low" label={t('Running low')} value={Number(metrics.lowStock || 0).toLocaleString()} icon={AlertTriangle} tone="amber" />
        <StatCard to="/inventory?status=out" label={t('Out of stock')} value={Number(metrics.outOfStock || 0).toLocaleString()} icon={PackageX} tone="red" />
      </div>
      <div className="panel p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-bold text-slate-900">{t('Sales over the last 30 days')}</h3></div><Link to="/sales" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-red-700">{t('View sales')}<ArrowRight size={17} className="shrink-0" aria-hidden="true" /></Link></div>
        {salesTrend.length ? <div className="mt-4 h-56 sm:h-64" role="img" aria-label={t('Sales revenue over the last 30 days')}><ResponsiveContainer width="100%" height="100%"><LineChart data={salesTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="day" tick={{ fontSize: 12 }} tickFormatter={value => String(value).slice(5)} minTickGap={25} /><YAxis tick={{ fontSize: 12 }} width={65} tickFormatter={value => `₱${value}`} /><Tooltip formatter={value => [peso(value), t('Sales')]} /><Line type="monotone" dataKey="revenue" stroke="#dc2626" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div> : <p className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">{t('No recorded sales for this period.')}</p>}
      </div>
    </section>}
    <section className="panel mb-6 p-5 sm:p-6" aria-labelledby="start-heading">
      <div className="grid gap-4">
        <h2 id="start-heading" className="text-xl font-bold text-slate-950">{t("What would you like to do?")}</h2>
        <div aria-label={t("Common actions")} className="grid gap-3 sm:grid-cols-2">{availableActions.map(({
            to,
            title,
            icon: Icon,
            tone
          }) => <Link key={to} to={to} className="group flex min-h-20 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-red-300 hover:bg-slate-50"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon size={23} aria-hidden="true" /></span><span className="min-w-0"><span className="block text-lg font-bold text-slate-900">{t(title)}</span></span><ArrowRight size={18} className="ml-auto shrink-0 text-slate-400 transition group-hover:text-red-600" aria-hidden="true" /></Link>)}</div>
        {canOpenPage(profile?.role, '/inventory') && <Form className="w-full border-t border-slate-100 pt-4" onSubmit={e => {
          e.preventDefault();
          navigate(`/inventory${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`);
        }}>
          <label htmlFor="home-part-search" className="label">{t("Find a part")}</label><div className="flex gap-2"><div className="relative min-w-0 flex-1"><ProductSearch id="home-part-search" label={t('Find a part')} placeholder={t('Part number, name or brand')} value={search} onChange={setSearch} onSelect={item=>navigate(`/inventory?q=${encodeURIComponent(item.product.part_number||item.label)}`)}/></div><button className="btn-primary" type="submit">{t("Find")}<ArrowRight size={17} /></button></div>
        </Form>}
      </div>
    </section>
    {data && <>
      <section className="panel overflow-hidden" aria-labelledby="attention-heading">
        <div className="panel-header"><div className="flex items-start gap-3"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${attention ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{attention ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}</span><div><h2 id="attention-heading" className="font-bold text-slate-900">{attention ? t('Parts need your attention') : t('Restocking check')}</h2>{attention > 0 && <p className="mt-1 text-sm text-slate-600">{t('{v0} out of stock · {v1} running low', {
                  v0: metrics.outOfStock || 0,
                  v1: metrics.lowStock || 0
                })}</p>}</div></div><Link to="/reorder" className="btn-secondary">{t("Review restocking")}<ArrowRight size={17} /></Link></div>
        {restock.length ? <><ul className="divide-y divide-slate-100">{restock.slice(0,3).map(r => <li key={r.product_id} className="flex flex-wrap items-center gap-3 px-5 py-4"><div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{t(r.description)}</p><p className="mt-1 text-sm text-slate-600">{r.part_number || t('No part number')} · {Number(r.current_stock)}{t(" available \xB7 Suggested order: ")}{suggestedQuantity(r)}</p></div><StatusBadge status={r.status} /></li>)}</ul>{restock.length>3&&<div className="border-t border-slate-100 px-5 py-3"><Link to="/reorder" className="btn-secondary w-full sm:w-auto">{t('View all restock recommendations')}<ArrowRight size={17} aria-hidden="true" /></Link></div>}</> : <div className="px-5 py-7 text-sm text-slate-600">{t('No restock recommendations.')}</div>}
      </section>
      <details className="panel group mt-6">
        <summary className="flex min-h-16 items-center justify-between gap-3 rounded-xl px-5 py-4 font-semibold text-slate-900 hover:bg-slate-50"><span className="flex min-w-0 items-center gap-3"><ChartNoAxesCombined size={22} className="shrink-0 text-slate-500" aria-hidden="true" /><span>{t('Sales & store insights')}</span></span><ChevronDown size={21} className="shrink-0 transition group-open:rotate-180" aria-hidden="true" /></summary>
        <div className="border-t border-slate-100 p-4 sm:p-5">
          <div className="grid gap-5 lg:grid-cols-2">{[['Best-selling parts', data.fastMoving || []], ['Parts selling less often', data.slowMoving || []]].map(([title, rows]) => <section key={title} className="rounded-xl border border-slate-200"><div className="border-b border-slate-100 p-4"><h3 className="font-semibold text-slate-900">{t(title)}</h3><p className="text-sm text-slate-600">{t("Last 90 days")}</p></div><ul className="divide-y divide-slate-100">{rows.map((r, i) => <li key={r.product_id} className="flex items-start gap-3 p-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600">{i + 1}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-900">{t(r.description)}</p><p className="text-xs text-slate-600">{r.part_number || t('No part number')}</p></div><span className="shrink-0 text-sm font-semibold text-slate-700">{Number(r.quantity || 0)}{t(" sold")}</span></li>)}</ul>{!rows.length && <p className="p-5 text-sm text-slate-600">{t("No sales history to show yet.")}</p>}</section>)}</div>
          {data.latestForecastRun && <p className="mt-5 text-sm text-slate-600">{t("Demand estimate last updated ")}{new Date(data.latestForecastRun.completed_at).toLocaleString()}. <Link to="/forecast" className="font-semibold text-red-700 underline underline-offset-4">{t("Review demand planning")}</Link></p>}
        </div>
      </details>
    </>}
  </div>;
}
