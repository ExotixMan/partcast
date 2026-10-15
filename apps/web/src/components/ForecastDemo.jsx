import {useState} from 'react';
import {FlaskConical, RefreshCw} from 'lucide-react';
import {useLocation} from 'react-router-dom';
import {api} from '../lib/api.js';
import {t, useLocale} from '../context/LocaleContext.jsx';

const number = value => value == null ? '—' : Number(value).toLocaleString(undefined,{maximumFractionDigits:2});
const percent = value => value == null ? t('Not measurable') : number(value) + '%';
function methodName(method) {
  if (method === 'direct_period_xgboost') return t('XGBoost: 30-day total');
  if (method === 'recursive_xgboost') return t('XGBoost: daily predictions');
  if (method === 'recent_average_28') return t('Recent 28-day average');
  return t('365-day average');
}

export default function ForecastDemo() {
  useLocale();
  const location = useLocation();
  const [expanded,setExpanded] = useState(()=>new URLSearchParams(location.search).get('demo')==='1');
  const [file,setFile] = useState(null), [busy,setBusy] = useState(false);
  const [result,setResult] = useState(null), [error,setError] = useState('');
  async function run() {
    if (!file || busy) return;
    setError(''); setResult(null);
    if (file.size > 25 * 1024 * 1024) {setError(t('Choose a workbook smaller than 25 MB.')); return;}
    setBusy(true);
    try {
      const body = new FormData(); body.append('file',file);
      let task = await api.post('/api/forecast/demo/jobs',body);
      const deadline = Date.now()+170000;
      while (task.status === 'running' && Date.now() < deadline) {
        await new Promise(resolve=>setTimeout(resolve,2000));
        task = await api.get('/api/forecast/demo/jobs/'+task.id);
      }
      if (task.status !== 'completed' || !task.result) throw new Error(task.error || t('The demo is taking longer than expected. Try again shortly.'));
      setResult(task.result);
    } catch (cause) {setError(cause.message);}
    finally {setBusy(false);}
  }
  const selected = result?.selected_method;
  const tested = selected ? result.test[selected] : null;
  return <details className="panel mb-5 overflow-hidden" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}>
    <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"><FlaskConical size={18} className="mr-2 inline" aria-hidden="true" />{t('Forecasting demo · simulated data')}</summary>
    <div className="border-t border-slate-200 p-5 sm:p-6">
      <h2 className="text-lg font-bold text-slate-950">{t('Test XGBoost with your demo workbook')}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{t('The demo uses the separate training, validation and test sheets in your workbook. Actual store sales, stock counts and restock recommendations stay unchanged.')}</p>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{t('Simulation results demonstrate the forecasting process. They do not measure accuracy on actual customer sales.')}</div>
      <label className="label mt-5" htmlFor="forecast-demo-file">{t('Choose the capstone demo workbook')}</label>
      <input id="forecast-demo-file" type="file" accept=".xlsx,.xlsm" className="input h-auto py-3" disabled={busy} onChange={event=>{setFile(event.target.files?.[0]||null);setResult(null);setError('');}} />
      <p className="mt-2 text-xs leading-5 text-slate-500">{t('Required sheets: IMPORT_Train_5Col, Validation_5Col and Test_5Col. Keep every day, including zero-demand days.')}</p>
      <button className="btn-secondary mt-4" disabled={!file||busy} onClick={run}><RefreshCw size={17} className={busy?'animate-spin':''} />{busy?t('Testing the demo…'):t('Test XGBoost demo')}</button>
      {busy&&<p role="status" className="mt-3 text-sm text-slate-600">{t('XGBoost is training and checking complete 30-day periods. This may take a few minutes.')}</p>}
      {error&&<p role="alert" className="mt-4 text-sm text-red-700">{t(error)}</p>}
      {result&&<div className="mt-6" aria-live="polite">
        <h3 className="font-bold text-slate-950">{t('Demo results · simulated sales only')}</h3>
        <p className="mt-2 break-all text-sm text-slate-600">{result.filename}</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">{t('{v0} parts. Training: {v1} to {v2}. Test: {v3} to {v4}.',{v0:result.part_count,v1:result.split_summary.train.start,v2:result.split_summary.train.end,v3:result.split_summary.test.start,v4:result.split_summary.test.end})}</p>
        {tested?<>
          <p className="mt-3 text-sm leading-6 text-slate-700">{t('XGBoost strategy selected using validation results:')} <strong>{methodName(selected)}</strong></p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4"><dt className="text-sm text-slate-600">{t('Simulated 30-day WAPE')}</dt><dd className="mt-2 text-2xl font-bold text-slate-950">{percent(tested.metrics.wape_percent)}</dd></div>
            <div className="rounded-xl bg-slate-50 p-4"><dt className="text-sm text-slate-600">{t('Average quantity error (MAE)')}</dt><dd className="mt-2 text-2xl font-bold text-slate-950">{number(tested.metrics.mae)}</dd></div>
            <div className="rounded-xl bg-slate-50 p-4"><dt className="text-sm text-slate-600">{t('Tested part-periods')}</dt><dd className="mt-2 text-2xl font-bold text-slate-950">{tested.window_count}</dd></div>
          </dl>
        </>:<p className="mt-3 text-sm text-amber-900">{t('Validation contains no recorded demand, so a strategy cannot be selected using WAPE.')}</p>}
        <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">{t('Demo model comparison')}</caption><thead className="bg-slate-50 text-slate-600"><tr><th scope="col" className="px-3 py-3">{t('Method')}</th><th scope="col" className="px-3 py-3 text-right">{t('Validation WAPE')}</th><th scope="col" className="px-3 py-3 text-right">{t('Test WAPE')}</th></tr></thead><tbody className="divide-y divide-slate-100">{Object.keys(result.test).map(method=><tr key={method}><th scope="row" className="px-3 py-3 font-medium text-slate-900">{methodName(method)}{method===selected&&<span className="ml-2 text-xs text-red-700">{t('Selected XGBoost')}</span>}</th><td className="px-3 py-3 text-right">{percent(result.validation[method].metrics.wape_percent)}</td><td className="px-3 py-3 text-right">{percent(result.test[method].metrics.wape_percent)}</td></tr>)}</tbody></table></div>
        <p className="mt-3 text-sm leading-6 text-slate-600">{t('Lower WAPE means lower quantity error. A moving average may perform better than XGBoost. The test period cannot choose the XGBoost strategy.')}</p>
        {result.future_periods?.length>0&&<div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-3 text-left font-semibold text-slate-900">{t('Next 30 days · demo quantities')}</caption><thead className="bg-slate-50 text-slate-600"><tr><th scope="col" className="px-3 py-3">{t('Part number')}</th><th scope="col" className="px-3 py-3">{t('Date range')}</th><th scope="col" className="px-3 py-3 text-right">{t('Estimated units')}</th></tr></thead><tbody className="divide-y divide-slate-100">{result.future_periods.map(row=><tr key={row.part_number}><th scope="row" className="px-3 py-3 font-medium">{row.part_number}</th><td className="px-3 py-3">{row.start} – {row.end}</td><td className="px-3 py-3 text-right">{number(row.predicted_units)}</td></tr>)}</tbody></table></div>}
        <p className="mt-4 text-xs leading-5 text-slate-500">{t('These are totals for a simulated scenario, not predictions of which day a real sale will occur. A fresh independent test with complete actual sales is still required.')}</p>
      </div>}
    </div>
  </details>;
}
