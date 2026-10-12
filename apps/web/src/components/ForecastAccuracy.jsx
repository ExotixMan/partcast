import {t,useLocale} from '../context/LocaleContext.jsx';

const number=value=>value!=null&&Number.isFinite(Number(value))?Number(value).toLocaleString(undefined,{maximumFractionDigits:4}):'—';
export default function ForecastAccuracy({metrics}){
 useLocale();
 if(!metrics)return null;
 const validation=metrics.horizon_validation;
 const status=validation?.status;
 const checked=Boolean(validation?.model);
 const title=!checked?t('More sales history is needed'):status==='no_recorded_test_demand'?t('No sales were recorded in these test periods'):status==='improvement_observed'?t('An improvement was observed in these tests'):t('Review this forecast before ordering');
 return <section className="panel mt-5 p-5 sm:p-6" aria-labelledby="forecast-accuracy-title">
  <h2 id="forecast-accuracy-title" className="text-lg font-bold text-slate-950">{t('How dependable is this estimate?')}</h2>
  <p className="mt-2 text-sm leading-6 text-slate-600">{t('The next-day average error was {v0} units per part. This is an error measure, not an accuracy percentage.',{v0:number(metrics.mae)})}</p>
  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
   <h3 className="font-semibold text-amber-950">{title}</h3>
   {!checked?<p className="mt-2 text-sm leading-6 text-amber-900">{t('Full-period accuracy is not available. Update the estimates to test the chosen planning period. More historical sales may be needed.')}</p>:<>
    <p className="mt-2 text-sm leading-6 text-amber-900">{t('Checked {v0} past periods of {v1} days across {v2} parts. Each period was predicted before its sales were used.',{v0:validation.window_count,v1:validation.horizon_days,v2:validation.tested_product_count})}</p>
    <dl className="mt-4 grid gap-4 sm:grid-cols-3">
     <div><dt className="text-sm text-amber-900">{t('Average error per planning period')}</dt><dd className="mt-1 text-xl font-bold text-slate-950">{number(validation.model.mae)} <span className="text-sm font-normal">{t('units')}</span></dd></div>
     <div><dt className="text-sm text-amber-900">{t('Overall quantity error (WAPE)')}</dt><dd className="mt-1 text-xl font-bold text-slate-950">{validation.model.wape_percent==null?t('Not measurable'):number(validation.model.wape_percent)+'%'}</dd></div>
     <div><dt className="text-sm text-amber-900">{t('Actual / estimated units in the tests')}</dt><dd className="mt-1 text-xl font-bold text-slate-950">{number(validation.model.actual_recorded_units)} / {number(validation.model.predicted_units)}</dd></div>
    </dl>
    <p className="mt-3 text-sm leading-6 text-amber-900">{t('Lower error is better. A quantity error near 100% means the forecast missed much of the recorded demand.')}</p>
    <p className="mt-2 text-sm leading-6 text-amber-900">{t('A recent-sales average had an error of {v0} units per period.',{v0:number(validation.recent_average?.mae)})}</p>
    {status==='no_improvement_over_zero'&&<p className="mt-2 text-sm font-semibold text-amber-950">{t('This forecast did not beat the zero-sales test. Zero is a diagnostic comparison, not an ordering recommendation.')}</p>}
    {status==='no_improvement_over_recent_average'&&<p className="mt-2 text-sm font-semibold text-amber-950">{t('This forecast did not improve on the simple recent-sales average.')}</p>}
    {status==='no_recorded_test_demand'&&<p className="mt-2 text-sm text-amber-900">{t('Percentage error cannot be calculated when the test period has no recorded sales.')}</p>}
    <p className="mt-2 text-sm leading-6 text-amber-900">{t('{v0} test periods had recorded sales. Sparse or incomplete records need more independent testing.',{v0:validation.nonzero_window_count})}</p>
   </>}
  </div>
  <p className="mt-3 text-sm leading-6 text-slate-600">{t('Past test results do not guarantee future sales. Check that sales records are complete and review stock before purchasing.')}</p>
 </section>;
}
