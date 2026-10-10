import { t, useLocale } from "../context/LocaleContext.jsx";
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, ArrowRight, Boxes, CheckCircle2, CircleDollarSign, PackageX, RefreshCw, Search, ShoppingCart, Truck } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api.js';
import Loading from '../components/Loading.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
const peso = value => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0
}).format(Number(value || 0));
const actions = [{
  to: '/counter',
  title: 'Record a sale',
  text: 'Choose the part and enter how many you sold.',
  icon: ShoppingCart,
  tone: 'red'
}, {
  to: '/counter?mode=stock_in',
  title: 'Receive stock',
  text: 'Add parts that arrived in a delivery.',
  icon: ArrowDownToLine,
  tone: 'emerald'
}, {
  to: '/reorder',
  title: 'Check parts to restock',
  text: 'See which parts need ordering.',
  icon: Truck,
  tone: 'amber'
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
  const load = async () => {
    setBusy(true);
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
  const metrics = data?.metrics || {};
  const attention = Number(metrics.lowStock || 0) + Number(metrics.outOfStock || 0);
  return <>
    <PageHeader title={t("Hello, {v0}", {
      v0: profile?.full_name?.split(' ')[0] || t('welcome')
    })} subtitle={t("Let’s take care of your store. Choose what you need to do below.")} actions={<button className="btn-secondary" onClick={load} disabled={busy}><RefreshCw size={17} className={busy ? 'animate-spin' : ''} />{busy ? t('Updating…') : t('Refresh overview')}</button>} />
    <section className="panel mb-6 p-5 sm:p-6" aria-labelledby="start-heading">
      <div className="grid gap-5 xl:grid-cols-[1fr_auto] xl:items-center">
        <div className="order-1"><p className="mb-1 hidden text-xs font-semibold uppercase tracking-wider text-red-700 sm:block">{t("Your everyday tasks")}</p><h2 id="start-heading" className="text-xl font-bold text-slate-950">{t("What would you like to do?")}</h2><p className="mt-1 hidden text-sm text-slate-600 sm:block">{t("Start with a part. We\u2019ll guide you through the rest.")}</p></div>
        <form className="order-3 w-full xl:order-2 xl:w-[28rem]" onSubmit={e => {
          e.preventDefault();
          navigate(`/inventory${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`);
        }}>
          <label htmlFor="home-part-search" className="label">{t("Find a part")}</label><div className="flex gap-2"><div className="relative min-w-0 flex-1"><Search size={19} className="pointer-events-none absolute left-3 top-4 text-slate-500" /><input id="home-part-search" className="input pl-10" placeholder={t("Part number, name or brand")} value={search} onChange={e => setSearch(e.target.value)} /></div><button className="btn-primary" type="submit">{t("Find")}<ArrowRight size={17} /></button></div>
        </form>
        <div aria-label={t("Common actions")} className="order-2 grid gap-3 md:grid-cols-3 xl:order-3 xl:col-span-2">{actions.map(({
            to,
            title,
            text,
            icon: Icon,
            tone
          }) => <Link key={to} to={to} className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-red-300 hover:bg-slate-50 sm:gap-4 sm:p-5"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon size={23} /></span><span className="min-w-0"><span className="block text-base font-bold text-slate-900">{t(title)}</span><span className="mt-1 block text-sm leading-5 text-slate-600">{t(text)}</span></span><ArrowRight size={18} className="ml-auto shrink-0 text-slate-400 transition group-hover:text-red-600" /></Link>)}</div>
      </div>
    </section>
    {data?.offline && <p role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t("This overview was saved ")}{new Date(data.savedAt).toLocaleString()}{t(". Inventory includes your waiting changes; these totals update after they are sent.")}</p>}
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{t(error)}<p className="mt-2">{t("You can still choose a task above. Use Refresh overview to try again.")}</p></div>}
    {!data && !error ? <Loading label={t("Getting your store overview…")} /> : data && <>
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard to="/inventory" label={t("Parts in inventory")} value={Number(metrics.totalProducts || 0).toLocaleString()} icon={Boxes} note="Browse your parts" />
        <StatCard to="/inventory?status=low" label={t("Running low")} value={Number(metrics.lowStock || 0).toLocaleString()} icon={AlertTriangle} tone="amber" note="At or below your minimum" />
        <StatCard to="/inventory?status=out" label={t("Out of stock")} value={Number(metrics.outOfStock || 0).toLocaleString()} icon={PackageX} tone="red" note="No stock available" />
        <StatCard label={t("Stock value")} value={peso(metrics.inventoryValue)} icon={CircleDollarSign} tone="emerald" note="Based on your recorded costs" />
      </div>
      <section className="panel overflow-hidden" aria-labelledby="attention-heading">
        <div className="panel-header"><div className="flex items-start gap-3"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${attention ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{attention ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}</span><div><h2 id="attention-heading" className="font-bold text-slate-900">{attention ? t('Parts need your attention') : t('Restocking check')}</h2><p className="mt-1 text-sm text-slate-600">{attention ? t("{v0} out of stock \xB7 {v1} running low. Check these before your next order.", {
                  v0: metrics.outOfStock || 0,
                  v1: metrics.lowStock || 0
                }) : t('Review low stock and demand estimates before ordering.')}</p></div></div><Link to="/reorder" className="btn-secondary">{t("Review restocking")}<ArrowRight size={17} /></Link></div>
        {(data.reorder || []).length ? <ul className="divide-y divide-slate-100">{data.reorder.map(r => <li key={r.product_id} className="flex flex-wrap items-center gap-3 px-5 py-4"><div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{t(r.description)}</p><p className="mt-1 text-sm text-slate-600">{r.part_number || t('No part number')} · {Number(r.current_stock)}{t(" available \xB7 Suggested order: ")}{Math.ceil(Number(r.recommended_quantity))}</p></div><StatusBadge status={r.status} /></li>)}</ul> : <div className="px-5 py-7 text-sm text-slate-600">{attention ? t('Open restocking to review low-stock parts and set up recommendations.') : t('There are no saved restock recommendations to show.')}</div>}
      </section>
      <details className="panel group mt-6">
        <summary className="flex min-h-16 flex-wrap items-center justify-between gap-2 rounded-2xl px-5 py-4 font-semibold text-slate-900 hover:bg-slate-50"><span>{t("Sales & store insights")}</span><span className="text-sm font-normal text-slate-600 group-open:hidden">{t("View sales trends and popular parts")}</span><span className="hidden text-sm font-normal text-slate-600 group-open:inline">{t("Hide details")}</span></summary>
        <div className="border-t border-slate-100 p-4 sm:p-5"><h3 className="font-bold text-slate-900">{t("Sales over the last 30 days")}</h3><p className="mt-1 text-sm text-slate-600">{t("Based on the sales your team recorded.")}</p>
          {(data.salesTrend || []).length ? <div className="mt-4 h-64" role="img" aria-label={t("Sales revenue over the last 30 days")}><ResponsiveContainer width="100%" height="100%"><LineChart data={data.salesTrend}><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="day" tick={{
                  fontSize: 12
                }} tickFormatter={v => String(v).slice(5)} /><YAxis tick={{
                  fontSize: 12
                }} width={65} tickFormatter={v => `₱${v}`} /><Tooltip formatter={v => [peso(v), 'Sales']} /><Line type="monotone" dataKey="revenue" stroke="#dc2626" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div> : <p className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">{t("No recorded sales for this period. Record sales as they happen to build your store history.")}</p>}
          <div className="mt-6 grid gap-5 lg:grid-cols-2">{[['Best-selling parts', data.fastMoving || []], ['Parts selling less often', data.slowMoving || []]].map(([title, rows]) => <section key={title} className="rounded-xl border border-slate-200"><div className="border-b border-slate-100 p-4"><h3 className="font-semibold text-slate-900">{t(title)}</h3><p className="text-sm text-slate-600">{t("Last 90 days")}</p></div><ul className="divide-y divide-slate-100">{rows.map((r, i) => <li key={r.product_id} className="flex items-start gap-3 p-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600">{i + 1}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-900">{t(r.description)}</p><p className="text-xs text-slate-600">{r.part_number || t('No part number')}</p></div><span className="shrink-0 text-sm font-semibold text-slate-700">{Number(r.quantity || 0)}{t(" sold")}</span></li>)}</ul>{!rows.length && <p className="p-5 text-sm text-slate-600">{t("No sales history to show yet.")}</p>}</section>)}</div>
          {data.latestForecastRun && <p className="mt-5 text-sm text-slate-600">{t("Demand estimate last updated ")}{new Date(data.latestForecastRun.completed_at).toLocaleString()}. <Link to="/forecast" className="font-semibold text-red-700 underline underline-offset-4">{t("Review demand planning")}</Link></p>}
        </div>
      </details>
    </>}
  </>;
}
