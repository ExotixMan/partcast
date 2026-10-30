import { useId, useState } from 'react';
import { Search } from 'lucide-react';

export default function SearchSuggestions({ value, onChange, items, onSelect, placeholder, label, loading = false, error = '' }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const visible = open && Boolean(value.trim());
  function choose(item) { onSelect(item); setOpen(false); setActive(-1); }
  return <div className="relative w-full">
    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18}/>
    <input className="input pl-10" role="combobox" aria-label={label || placeholder} aria-autocomplete="list" aria-expanded={visible} aria-controls={visible ? id : undefined} aria-activedescendant={visible && items[active] ? `${id}-${active}` : undefined}
      autoComplete="off" placeholder={placeholder} value={value}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { setOpen(false); setActive(-1); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true);
          setActive(index => !items.length ? -1 : event.key === 'ArrowDown' ? Math.min(index + 1, items.length - 1) : Math.max(index - 1, 0));
        }
        if (event.key === 'Enter' && visible && items[active]) { event.preventDefault(); choose(items[active]); }
      }}/>
    {visible && <ul id={id} role="listbox" aria-label="Search suggestions" className="absolute left-0 right-0 z-10 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
      {items.map((item, index) => <li key={item.id} id={`${id}-${index}`} role="option" aria-selected={active === index}
        className={`cursor-pointer px-3 py-2 text-sm ${active === index ? 'bg-red-50' : 'hover:bg-slate-50'}`}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(item)}>
        <span className="block font-semibold text-slate-900">{item.label}</span>
        {item.description && <span className="block text-xs text-slate-500">{item.description}</span>}
      </li>)}
      {!items.length && <li role="presentation" className="px-3 py-3 text-sm text-slate-500">{loading ? 'Searching…' : error ? 'Search unavailable. Please try again.' : 'No matches found.'}</li>}
    </ul>}
  </div>;
}
