import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../lib/api.js';
import Loading from '../components/Loading.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
const peso = value => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP'
}).format(Number(value || 0));
const date = value => value ? new Date(value).toLocaleString() : 'Date unavailable';
export default function TransactionsPage() {
  useLocale();
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const pageSize = 25;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.get(`/api/transactions?page=${page}&pageSize=${pageSize}&type=${type}`).then(result => {
      if (!active) return;
      setRows(result.data || []);
      setCount(result.count || 0);
    }).catch(cause => {
      if (active) setError(cause.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [page, type, refresh]);
  return <>
    <PageHeader title={t("Stock history")} subtitle={t("See when parts arrived, were sold, or were removed from stock. Each saved change stays in this history.")} actions={<button className="btn-secondary" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={17} aria-hidden="true" />{t("Refresh history")}</button>} />
    <section className="panel overflow-hidden" aria-busy={loading}>
      <div className="panel-header flex flex-wrap items-end justify-between gap-3">
        <label className="block w-full sm:w-60" htmlFor="history-type"><span className="label">{t("Show stock changes")}</span>
          <select id="history-type" className="input" value={type} onChange={event => {
            setType(event.target.value);
            setPage(1);
          }}>
            <option value="all">{t("All stock changes")}</option><option value="stock_in">{t("Parts received")}</option><option value="stock_out">{t("Parts removed")}</option><option value="sale">{t("Parts sold")}</option><option value="initial">{t("Starting stock")}</option>
          </select>
        </label>
        {!loading && !error && <p className="text-sm text-slate-600">{count.toLocaleString()} {count === 1 ? t('saved change') : t('saved changes')}</p>}
      </div>
      {loading ? <Loading label={t("Loading stock history…")} /> : error ? <div className="space-y-3 p-5" role="alert"><h2 className="font-semibold text-slate-900">{t("Stock history could not be loaded")}</h2><p className="text-sm text-red-700">{t(error)}</p><button className="btn-secondary" onClick={() => setRefresh(value => value + 1)}>{t("Try again")}</button></div> : rows.length === 0 ? <EmptyState title={type === 'all' ? t('No stock changes yet') : t('No matching stock changes')} text={type === 'all' ? t('Sales, deliveries, and stock corrections appear here after you save them.') : t('Choose “All stock changes” to see the rest of your history.')} /> : <>
        <div className="divide-y divide-slate-100 lg:hidden">
          {rows.map(row => <article key={row.id} className="space-y-3 p-5">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold text-slate-900">{row.product?.part_number || t('Part unavailable')}</h2><p className="mt-1 text-sm text-slate-600">{row.product?.description || t('No description saved')}</p></div><StatusBadge status={row.tx_type} /></div>
            <p className="text-sm text-slate-500"><time dateTime={row.occurred_at}>{date(row.occurred_at)}</time></p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><div><dt className="text-slate-500">{t("Quantity")}</dt><dd className="mt-1 font-semibold text-slate-900">{Number(row.quantity).toFixed(0)} {Number(row.quantity) === 1 ? t('part') : t('parts')}</dd></div><div><dt className="text-slate-500">{t("Amount")}</dt><dd className="mt-1 font-semibold text-slate-900">{row.total_amount != null ? peso(row.total_amount) : t('Not recorded')}</dd></div><div><dt className="text-slate-500">{t("Reference number")}</dt><dd className="mt-1 break-words text-slate-700">{row.reference_no || t('Not recorded')}</dd></div><div><dt className="text-slate-500">{t("Supplier or customer")}</dt><dd className="mt-1 break-words text-slate-700">{row.supplier?.name || row.customer_name || t('Not recorded')}</dd></div></dl>
          </article>)}
        </div>
        <div className="hidden overflow-x-auto lg:block"><table className="min-w-full text-left text-sm"><caption className="sr-only">{t("Saved changes to stock, including received parts and sales")}</caption><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th scope="col" className="px-5 py-3">{t("Date and time")}</th><th scope="col" className="px-4 py-3">{t("Change")}</th><th scope="col" className="px-4 py-3">{t("Part")}</th><th scope="col" className="px-4 py-3 text-right">{t("Quantity")}</th><th scope="col" className="px-4 py-3">{t("Reference")}</th><th scope="col" className="px-4 py-3">{t("Supplier or customer")}</th><th scope="col" className="px-5 py-3 text-right">{t("Amount")}</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.id}><td className="whitespace-nowrap px-5 py-4 text-slate-600"><time dateTime={row.occurred_at}>{date(row.occurred_at)}</time></td><td className="px-4 py-4"><StatusBadge status={row.tx_type} /></td><td className="px-4 py-4"><p className="font-semibold text-slate-900">{row.product?.part_number || t('Part unavailable')}</p><p className="mt-1 max-w-xs text-slate-500">{row.product?.description}</p></td><td className="px-4 py-4 text-right font-semibold">{Number(row.quantity).toFixed(0)}</td><td className="px-4 py-4 text-slate-600">{row.reference_no || '—'}</td><td className="px-4 py-4 text-slate-600">{row.supplier?.name || row.customer_name || '—'}</td><td className="px-5 py-4 text-right text-slate-700">{row.total_amount != null ? peso(row.total_amount) : '—'}</td></tr>)}</tbody>
        </table></div>
      </>}
      {!loading && !error && <Pagination page={page} pageSize={pageSize} count={count} onPage={setPage} />}
    </section>
  </>;
}
