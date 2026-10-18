import { t, useLocale } from "../context/LocaleContext.jsx";
export default function PageHeader({
  title,
  subtitle,
  actions,
  inlineActions = false
}) {
  useLocale();
  return <div className={`mb-4 flex gap-3 ${inlineActions?'flex-row items-start justify-between':'flex-col sm:flex-row sm:items-end sm:justify-between'}`}>
    <div className="min-w-0"><h1 className="page-title">{t(title)}</h1>{subtitle && <p className="page-subtitle">{t(subtitle)}</p>}</div>
    {actions && <div className="flex max-w-full shrink-0 flex-wrap gap-2">{actions}</div>}
  </div>;
}
