import { CarFront, Check, Droplets, Fuel, LayoutGrid, PackageOpen, Wrench } from 'lucide-react';
import { t, useLocale } from '../context/LocaleContext.jsx';
import { categories } from '../lib/store.js';

const appearance = {
  all: { icon: LayoutGrid, tone: 'bg-slate-100 text-slate-700' },
  parts: { icon: Wrench, tone: 'bg-red-50 text-red-700' },
  lubricants: { icon: Droplets, tone: 'bg-amber-50 text-amber-800' },
  fuel: { icon: Fuel, tone: 'bg-blue-50 text-blue-700' },
  accessories: { icon: CarFront, tone: 'bg-violet-50 text-violet-700' },
  other: { icon: PackageOpen, tone: 'bg-emerald-50 text-emerald-700' }
};

export default function CounterCategories({ value, onChange, disabled = false }) {
  useLocale();

  return <div role="group" aria-label={t('Browse categories')} className="counter-categories grid grid-cols-3 gap-2 xl:grid-cols-6 sm:gap-3">
    {categories.map(([id, label]) => {
      const { icon: Icon, tone } = appearance[id];
      const selected = value === id;

      return <button
        key={id}
        type="button"
        aria-label={t(label)}
        aria-pressed={selected}
        disabled={disabled}
        onClick={() => onChange(id)}
        className={`relative flex min-h-32 min-w-0 flex-col items-center gap-3 rounded-2xl border px-2 py-3 text-center transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-red-500 bg-red-50 shadow-sm' : 'border-slate-200 bg-white hover:border-red-300 hover:bg-slate-50'}`}
      >
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tone}`}>
          <Icon size={27} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <span className={`w-full min-w-0 break-words text-sm font-semibold leading-snug ${selected ? 'text-red-800' : 'text-slate-700'}`}>{t(label)}</span>
        {selected && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-red-600 text-white"><Check size={13} strokeWidth={3} aria-hidden="true" /></span>}
      </button>;
    })}
  </div>;
}
