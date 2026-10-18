import { t, useLocale } from "../context/LocaleContext.jsx";
import { Inbox } from 'lucide-react';
export default function EmptyState({
  title = 'No records found',
  text = 'There is nothing to show for the current filters.'
}) {
  useLocale();
  return <div className="flex flex-col items-center justify-center px-4 py-8 text-center"><div className="rounded-lg bg-slate-100 p-2 text-slate-500"><Inbox size={20} /></div><h3 className="mt-3 text-base font-semibold text-slate-800">{t(title)}</h3><p className="mt-1 max-w-md text-sm text-slate-500">{t(text)}</p></div>;
}
