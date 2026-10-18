import {CircleHelp,ChevronDown} from 'lucide-react';
import {t,useLocale} from '../context/LocaleContext.jsx';
export default function HelpDetails({title='Page help',children,className=''}) {
 useLocale();
 return <details className={`page-help group ${className}`}>
  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 text-sm font-semibold text-slate-600"><CircleHelp size={17} aria-hidden="true"/><span>{t(title)}</span><ChevronDown size={16} className="ml-auto shrink-0 group-open:rotate-180" aria-hidden="true"/></summary>
  <div className="space-y-2 border-t border-slate-200 pb-3 pt-3 text-sm leading-6 text-slate-600">{children}</div>
 </details>;
}
