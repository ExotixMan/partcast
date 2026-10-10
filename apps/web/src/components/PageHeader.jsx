import { t, useLocale } from "../context/LocaleContext.jsx";
export default function PageHeader({
  title,
  subtitle,
  actions
}) {
  useLocale();
  return <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
    <div><h1 className="page-title">{t(title)}</h1>{subtitle && <p className="page-subtitle">{t(subtitle)}</p>}</div>
    {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
  </div>;
}
