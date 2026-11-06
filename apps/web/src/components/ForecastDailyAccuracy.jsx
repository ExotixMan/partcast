import {t} from '../context/LocaleContext.jsx';

const number=value=>value!=null&&Number.isFinite(Number(value))?Number(value).toLocaleString(undefined,{maximumFractionDigits:4}):'—';
export default function ForecastDailyAccuracy({validation}){
 if(!validation?.model)return null;
 return <div className="mt-3">
  <p className="font-semibold text-slate-900">{t('Daily timing test')}</p>
  <p className="mt-1 text-slate-600">{t('Compared {v0} part-days in the same historical test periods. Daily errors differ from whole-period errors.',{v0:number(validation.day_count)})}</p>
  <dl className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
   <div><dt className="text-slate-500">{t('Daily average error (MAE)')}</dt><dd>{number(validation.model.mae)} {t('units')}</dd></div>
   <div><dt className="text-slate-500">{t('Daily larger-error measure (RMSE)')}</dt><dd>{number(validation.model.rmse)} {t('units')}</dd></div>
   <div><dt className="text-slate-500">{t('Daily quantity error (WAPE)')}</dt><dd>{validation.model.wape_percent==null?t('Not measurable'):number(validation.model.wape_percent)+'%'}</dd></div>
   <div><dt className="text-slate-500">{t('Uniform allocation MAE / RMSE')}</dt><dd>{number(validation.uniform_allocation?.mae)} / {number(validation.uniform_allocation?.rmse)} {t('units')}</dd></div>
  </dl>
 </div>;
}
