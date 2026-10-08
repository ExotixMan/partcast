import { Link } from 'react-router-dom';
export default function StatCard({ label, value, note, icon:Icon, tone='slate', to }) {
  const toneClass={red:'bg-red-50 text-red-700',amber:'bg-amber-50 text-amber-700',emerald:'bg-emerald-50 text-emerald-700',slate:'bg-slate-100 text-slate-700'}[tone];
  const content=<><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-600">{label}</p>{Icon&&<div className={`hidden shrink-0 rounded-xl p-2 sm:block ${toneClass}`}><Icon size={19}/></div>}</div><p className="mt-3 break-words text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{value}</p>{note&&<p className="mt-2 text-xs leading-5 text-slate-600">{note}</p>}</>;
  return to?<Link to={to} className="panel block p-4 transition hover:border-red-300 sm:p-5">{content}</Link>:<div className="panel p-4 sm:p-5">{content}</div>;
}
