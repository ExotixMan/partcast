import { t, useLocale } from "../context/LocaleContext.jsx";
export default function StatusBadge({
  status
}) {
  useLocale();
  const s = String(status || '').toLowerCase();
  const cls = s.includes('out') ? 'bg-red-50 text-red-700' : s.includes('low') || s.includes('forecast') ? 'bg-amber-50 text-amber-700' : s.includes('fail') ? 'bg-red-50 text-red-700' : s.includes('complete') || s.includes('sent') || s === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700';
  const labels = {
    ok: 'In stock',
    low: 'Running low',
    out: 'Out of stock',
    out_of_stock: 'Out of stock',
    low_stock: 'Running low',
    forecast_reorder: 'Restock suggested',
    stock_in: 'Stock received',
    stock_out: 'Stock removed',
    sale: 'Sale',
    initial: 'Starting stock',
    completed: 'Completed',
    running: 'Calculating',
    failed: 'Failed',
    sent: 'Sent'
  };
  return <span className={`badge ${cls}`}>{labels[s] || String(status || '').replaceAll('_', ' ')}</span>;
}
