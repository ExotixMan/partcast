import {AlertTriangle,CheckCircle2,Package,TrendingUp} from 'lucide-react';
import {stockSummary} from '../lib/forecastSummary.js';
import {t,useLocale} from '../context/LocaleContext.jsx';

export default function ForecastStockSummary({product,stock}){
  const {language}=useLocale();
  const summary=stockSummary(product?.predicted_total,stock);
  const number=value=>Number(value).toLocaleString(language==='fil'?'fil-PH':'en-PH',{maximumFractionDigits:1});
  if(!product?.forecast_days)return <p role="status" className="p-5 text-sm text-slate-600">{t('No demand estimate is available for this part yet.')}</p>;
  if(!summary)return <p role="status" className="p-5 text-sm text-slate-600">{t('Current stock is unavailable. Try again when connected.')}</p>;
  const Icon=summary.sufficient?CheckCircle2:AlertTriangle;
  const coverage=summary.coverage==null?null:Number(summary.coverage.toFixed(1));
  return <article className="p-4 sm:p-6" aria-label={t('Demand forecast summary')}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('Demand forecast')}</p>
        <h3 className="mt-2 break-words text-xl font-bold text-slate-950">{product.description} <span className="text-sm font-normal text-slate-500">{product.part_number}</span></h3>
        <p className="mt-1 text-sm text-slate-600">{t('Next {v0} forecast days',{v0:product.forecast_days})}</p>
      </div>
      <span role="status" className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${summary.sufficient?'bg-emerald-50 text-emerald-800':'bg-amber-50 text-amber-900'}`}><Icon size={16} aria-hidden="true"/>{t(summary.sufficient?'Sufficient stock':'Restocking needed')}</span>
    </div>
    <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6">
      {[[TrendingUp,'Predicted demand',summary.demand],[Package,'Current stock',summary.stock],[Package,'Remaining after demand',summary.remaining]].map(([MetricIcon,label,value])=><div key={label} className="min-w-0"><dt className="flex items-start gap-2 text-sm text-slate-600"><MetricIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0"/>{t(label)}</dt><dd className="mt-2 break-words text-3xl font-bold text-slate-950">{number(value)} <span className="text-sm font-normal text-slate-600">{product.unit||t('units')}</span></dd></div>)}
      {summary.shortage>0&&<div><dt className="text-sm text-amber-800">{t('Short by')}</dt><dd className="mt-2 break-words text-3xl font-bold text-amber-800">{number(summary.shortage)} <span className="text-sm font-normal">{product.unit||t('units')}</span></dd></div>}
    </dl>
    <div className="mt-7">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><p className="font-semibold text-slate-800">{t('Stock coverage')}</p>{coverage!=null&&<span className="font-bold text-slate-900">{number(coverage)}%</span>}</div>
      {coverage==null?<p className="mt-2 text-sm text-slate-600">{t('No demand is estimated for this period.')}</p>:<>
        <div role="progressbar" aria-label={t('Stock coverage')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={coverage} aria-valuetext={`${number(coverage)}%`} className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full transition-[width] ${summary.sufficient?'bg-emerald-600':'bg-amber-500'}`} style={{width:`${summary.coverage}%`}}/></div>
        <div className="mt-2 flex justify-between gap-2 text-xs text-slate-500"><span>0%</span><span>100%</span></div>
        <p className="mt-2 text-sm text-slate-600">{t('{v0} of {v1} estimated units covered by current stock.',{v0:number(Math.min(summary.stock,summary.demand)),v1:number(summary.demand)})}</p>
      </>}
    </div>
    <div className="mt-6 rounded-xl bg-slate-50 p-4"><h4 className="font-semibold text-slate-900">{t('Stock recommendation')}</h4><p className="mt-2 text-sm leading-6 text-slate-600">{summary.sufficient?t('Current stock covers the estimated demand for this period. No immediate restocking is required.'):t('Plan to restock at least {v0} units to cover estimated demand.',{v0:number(Math.ceil(summary.shortage))})}</p></div>
  </article>;
}
