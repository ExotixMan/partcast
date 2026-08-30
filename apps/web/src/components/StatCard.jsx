export default function StatCard({ label, value, note, icon:Icon, tone='slate' }) {
  const toneClass={red:'bg-red-50 text-red-700',amber:'bg-amber-50 text-amber-700',emerald:'bg-emerald-50 text-emerald-700',slate:'bg-slate-100 text-slate-700'}[tone];
  return <div className="panel p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{value}</p>{note&&<p className="mt-1 text-xs text-slate-500">{note}</p>}</div>{Icon&&<div className={`rounded-xl p-2.5 ${toneClass}`}><Icon size={20}/></div>}</div></div>;
}
