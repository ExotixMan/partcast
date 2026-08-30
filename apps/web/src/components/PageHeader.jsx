export default function PageHeader({ title, subtitle, actions }) {
  return <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
    <div><h1 className="page-title">{title}</h1>{subtitle&&<p className="page-subtitle">{subtitle}</p>}</div>
    {actions&&<div className="flex flex-wrap gap-2">{actions}</div>}
  </div>;
}
