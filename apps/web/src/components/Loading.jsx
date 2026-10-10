import { t, useLocale } from "../context/LocaleContext.jsx";
import { LoaderCircle } from 'lucide-react';
export default function Loading({
  label = 'Getting your information…'
}) {
  useLocale();
  return <div role="status" className="flex min-h-48 items-center justify-center gap-3 p-5 text-sm text-slate-600"><LoaderCircle className="animate-spin" size={22} />{t(label)}</div>;
}
