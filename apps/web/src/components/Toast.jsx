import { t, useLocale } from "../context/LocaleContext.jsx";
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
export default function Toast({
  toast,
  onClose
}) {
  useLocale();
  if (!toast) return null;
  const good = toast.type !== 'error';
  return createPortal(<div role={good ? "status" : "alert"} className={`fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-[70] ml-auto flex max-w-md items-start gap-3 rounded-2xl border bg-white p-4 shadow-xl lg:bottom-6 lg:left-auto lg:right-6 ${good ? 'border-emerald-200' : 'border-red-200'}`}>
    {good ? <CheckCircle2 className="mt-0.5 text-emerald-600" size={20} /> : <AlertCircle className="mt-0.5 text-red-600" size={20} />}
    <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-900">{toast.title || (good ? t('Done') : t('Please check'))}</p><p className="mt-1 text-sm leading-6 text-slate-600">{t(toast.message)}</p></div>
    <button aria-label={t("Close message")} onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-50 hover:text-slate-700"><X size={19} /></button>
  </div>, document.body);
}
