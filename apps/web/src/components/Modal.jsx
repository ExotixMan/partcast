import { t, useLocale } from "../context/LocaleContext.jsx";
import { X } from 'lucide-react';
import { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
export default function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md'
}) {
  useLocale();
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    ref.current?.querySelector('input,select,textarea,button')?.focus();
    const onKey = e => {
      if (e.key === 'Escape') closeRef.current?.();
      if (e.key === 'Tab') {
        const focusable = [...ref.current.querySelectorAll('button,input,select,textarea,a[href],summary')].filter(el => !el.disabled && el.getClientRects().length);
        const first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) {
          e.preventDefault();
          last?.focus();
        }
        if (!e.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement))) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const old = document.body.style.overflow;
    const app = document.getElementById('root'),
      wasInert = app?.inert;
    if (app) app.inert = true;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = old;
      if (app) app.inert = wasInert;
      previous?.focus();
    };
  }, [open]);
  if (!open) return null;
  const widths = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl'
  };
  return createPortal(<div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/25 p-0 sm:items-center sm:p-4" onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className={`flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90dvh] sm:rounded-2xl ${widths[size]}`}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div><h2 id={titleId} className="text-lg font-bold text-slate-950">{t(title)}</h2>{description && <p id={descriptionId} className="mt-1 text-sm leading-6 text-slate-600">{description}</p>}</div>
          <button aria-label={t("Close modal")} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-slate-100" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>, document.body);
}
