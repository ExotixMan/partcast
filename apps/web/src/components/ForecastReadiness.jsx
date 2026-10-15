import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../lib/api.js';
import {t} from '../context/LocaleContext.jsx';

const messages = {
  no_observations:'Record or import actual sales first.',
  no_eligible_parts:'Each part needs more sales history.',
  stale_history:'Recent sales are missing for parts with enough history.',
  insufficient_feature_rows:'More dated history is needed for training and testing.',
  insufficient_evaluation_rows:'More dated history is needed for training and testing.',
  ready:'History can be used for training.'
};
const reasonLabels = {
  too_few_sale_days:'Fewer than 5 sale days',
  short_history:'History spans fewer than 35 days',
  old_history:'Latest sale is more than 31 days old'
};
const date = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined,{dateStyle:'medium'}) : '—';

export default function ForecastReadiness({includeProxy,refreshKey,onChange}) {
  const [report,setReport] = useState(null), [error,setError] = useState('');
  const [checking,setChecking] = useState(true), [retry,setRetry] = useState(0), [query,setQuery] = useState('');
  useEffect(()=>{
    let active = true;
    setChecking(true);setError('');onChange(null);
    api.get(`/api/forecast/readiness?includeProxy=${Boolean(includeProxy)}`).then(result=>{
      if(active){setReport(result);onChange(result);}
    }).catch(error=>{if(active){setReport(null);setError(error.message);}})
      .finally(()=>{if(active)setChecking(false);});
    return ()=>{active=false;};
  },[includeProxy,refreshKey,retry,onChange]);
  const matched = (report?.products||[]).filter(row=>`${row.part_number||''} ${row.description||''} ${row.product_id}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="panel mt-5 p-5 sm:p-6" aria-labelledby="forecast-readiness-title" aria-busy={checking}>
    <h2 id="forecast-readiness-title" className="text-lg font-bold">{t('Can these sales train XGBoost?')}</h2>
    {checking ? <p className="mt-3 text-sm text-slate-600" role="status">{t('Checking sales history…')}</p> : error ? <div role="alert" className="mt-3 text-sm text-amber-900"><p>{t('Sales history could not be checked.')}</p><p className="mt-1">{t(error)}</p></div> : report && <>
      <p className={`mt-3 font-semibold ${report.ready?'text-emerald-800':'text-amber-900'}`} role="status">{t(messages[report.status]||report.message)}</p>
      <p className="mt-2 text-sm text-slate-600">{t('{v0} saved records · {v1} parts meet the current history checks.',{v0:report.record_count,v1:report.current_part_count})}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{t('For each part: at least {v0} distinct sale days across {v1} calendar days, with a usable sale within {v2} days. The engine also checks that enough rows remain for training and testing.',{v0:report.requirements.sale_days,v1:report.requirements.calendar_days,v2:report.requirements.maximum_age_days})}</p>
      <p className="mt-2 text-sm text-slate-600">{t('Latest recorded sale: {v0}',{v0:date(report.latest_sale_date)})}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{t('Days without records are not confirmed zero sales. Passing these checks does not establish forecast accuracy.')}</p>
      {report.products.length>0 && <details className="mt-4 rounded-xl border border-slate-200 p-4">
        <summary className="cursor-pointer font-semibold">{t('See what each part is missing')}</summary>
        <label className="mt-4 block"><span className="label">{t('Find a part in sales history')}</span><input className="input" type="search" value={query} onChange={event=>setQuery(event.target.value)} /></label>
        <p className="mt-2 text-xs text-slate-500">{t('Showing {v0} of {v1} matching parts.',{v0:Math.min(25,matched.length),v1:matched.length})}</p>
        <div className="mt-3 max-h-80 space-y-3 overflow-y-auto">
          {matched.slice(0,25).map(row=><article key={row.product_id} className="rounded-xl bg-slate-50 p-3 text-sm">
            <h3 className="break-words font-bold">{row.part_number||row.product_id}</h3>
            {row.description&&<p className="mt-1 break-words text-slate-600">{row.description}</p>}
            <p className="mt-2 text-slate-600">{t('{v0} sale days · {v1} calendar days of history',{v0:row.sale_days,v1:row.calendar_days})}</p>
            <p className="mt-1 text-slate-600">{t('Latest recorded sale: {v0}',{v0:date(row.last_sale_date)})}</p>
            <p className={`mt-2 font-medium ${row.reasons.length?'text-amber-900':'text-emerald-800'}`}>{row.reasons.length?row.reasons.map(reason=>t(reasonLabels[reason]||reason)).join(' · '):t('Meets part history checks')}</p>
          </article>)}
        </div>
      </details>}
    </>}
    <div className="mt-4 flex flex-wrap gap-3">
      <button className="btn-secondary" disabled={checking} onClick={()=>setRetry(value=>value+1)}>{t('Check sales history again')}</button>
      <Link className="btn-secondary" to="/imports">{t('Import actual sales')}</Link>
      <Link className="btn-secondary" to="/counter">{t('Record a sale')}</Link>
    </div>
  </section>;
}
