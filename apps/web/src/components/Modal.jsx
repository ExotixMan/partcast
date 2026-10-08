import { X } from 'lucide-react';
import { useEffect, useRef, useId } from 'react';

export default function Modal({ open, title, description, onClose, children, footer, size='md' }) {
  const ref=useRef(null);
  const titleId=useId();
  useEffect(() => {
    if (!open) return;
    const previous=document.activeElement;
    ref.current?.querySelector('input,select,textarea,button')?.focus();
    const onKey = e => {
      if(e.key==='Escape')onClose?.();
      if(e.key==='Tab'){
        const focusable=[...ref.current.querySelectorAll('button,input,select,textarea,a[href]')].filter(el=>!el.disabled&&el.offsetParent!==null);
        const first=focusable[0],last=focusable.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown', onKey);
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = old; previous?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm:'max-w-md', md:'max-w-xl', lg:'max-w-3xl', xl:'max-w-5xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={e=>e.target===e.currentTarget&&onClose?.()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`max-h-[92vh] w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${widths[size]}`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div><h2 id={titleId} className="text-lg font-bold text-slate-950">{title}</h2>{description&&<p className="mt-1 text-sm text-slate-500">{description}</p>}</div>
          <button aria-label="Close modal" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={onClose}><X size={19}/></button>
        </div>
        <div className="max-h-[calc(92vh-150px)] overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}
