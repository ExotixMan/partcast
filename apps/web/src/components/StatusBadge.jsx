export default function StatusBadge({ status }) {
  const s=String(status||'').toLowerCase();
  const cls=s.includes('out')?'bg-red-50 text-red-700':s.includes('low')||s.includes('forecast')?'bg-amber-50 text-amber-700':s.includes('fail')?'bg-red-50 text-red-700':s.includes('complete')||s.includes('sent')||s==='ok'?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-700';
  return <span className={`badge ${cls}`}>{String(status||'').replaceAll('_',' ')}</span>;
}
