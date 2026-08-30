import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export default function Toast({ toast, onClose }) {
  if (!toast) return null;
  const good = toast.type !== 'error';
  return <div className="fixed bottom-4 right-4 z-[70] flex max-w-sm items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
    {good ? <CheckCircle2 className="mt-0.5 text-emerald-600" size={20}/> : <AlertCircle className="mt-0.5 text-red-600" size={20}/>} 
    <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-900">{toast.title || (good?'Done':'Error')}</p><p className="mt-0.5 text-sm text-slate-600">{toast.message}</p></div>
    <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18}/></button>
  </div>;
}
