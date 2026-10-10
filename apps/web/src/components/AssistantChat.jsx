import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, CircleHelp, MessageCircle, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { answerLocally } from '../lib/localAssistant.js';
import { api } from '../lib/api.js';
const suggestions = ['How do I record a sale?', 'How do I receive a delivery?', 'How do I find a part?', 'Which items are out of stock?', 'Which items should I restock?'];
export default function AssistantChat() {
  const {language}=useLocale();
  const {
    session
  } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{
    role: 'assistant',
    text: 'Hello! What would you like to do? I can guide you through a sale or delivery, help you find a part, or check what needs restocking.'
  }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'end'
    });
  }, [open, messages, busy]);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const app = document.getElementById('root');
    const previousInert = app?.inert;
    document.body.style.overflow = 'hidden';
    if (app) app.inert = true;
    dialogRef.current?.querySelector('button')?.focus();
    const handleKeys = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = [...(dialogRef.current?.querySelectorAll('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]') || [])].filter(control => control.getClientRects().length);
      const first = controls[0],
        last = controls[controls.length - 1];
      const activeIsFocusable = controls.includes(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !activeIsFocusable)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !activeIsFocusable)) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => {
      window.removeEventListener('keydown', handleKeys);
      document.body.style.overflow = previousOverflow;
      if (app) app.inert = previousInert;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);
  useEffect(() => {
    const openHelp = () => setOpen(true);
    window.addEventListener('partcast:help', openHelp);
    return () => window.removeEventListener('partcast:help', openHelp);
  }, []);
  async function send(value = text) {
    const message = String(value || '').trim();
    if (!message || busy) return;
    setText('');
    setMessages(current => [...current, {
      role: 'user',
      text: message
    }]);
    setBusy(true);
    try {
      const response = (await answerLocally(message, session.user.id, navigator.onLine,language)) || (await api.post('/api/assistant/chat', {message,language}));
      setMessages(current => [...current, {
        role: 'assistant',
        source: response.mode === 'gemini' ? 'Suggested answer · double-check important details' : response.mode === 'database' ? 'From your store records' : undefined,
        text: response.answer || 'I could not find an answer in the store records. Try the part name or part number, or ask your store owner.'
      }]);
    } catch (error) {
      const local = await answerLocally(message, session.user.id, false,language);
      setMessages(current => [...current, {
        role: 'assistant',
        text: 'I could not check updated store records. ' + (local?.answer || 'Please reconnect and try again.')
      }]);
    } finally {
      setBusy(false);
    }
  }
  return <>
    {open && createPortal(<div className="fixed inset-0 z-50 flex items-end justify-end bg-slate-900/20 p-0 sm:p-5" onClick={() => setOpen(false)}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-label={t("Store Assistant")} aria-describedby="assistant-description" className="flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:h-[680px] sm:max-h-[90dvh] sm:w-[440px] sm:rounded-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600"><MessageCircle aria-hidden="true" size={23} /></span>
          <div className="min-w-0 flex-1"><h2 className="text-base font-bold text-slate-900">{t("How can I help?")}</h2><p id="assistant-description" className="mt-0.5 text-sm text-slate-500">{t("Your PartCast store assistant")}</p></div>
          <button aria-label={t("Close Store Assistant")} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800" onClick={() => setOpen(false)}><X aria-hidden="true" size={22} /></button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain bg-[#f8f9fb] p-4">
          <div role="log" aria-label={t("Conversation with Store Assistant")} aria-live="polite" aria-relevant="additions text" className="space-y-4">
            {messages.map((message, index) => <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'rounded-br-md border border-red-100 bg-red-50 text-red-950' : 'rounded-bl-md border border-slate-200 bg-white text-slate-700'}`}>
                <p className={`mb-1 text-xs font-semibold ${message.role === 'user' ? 'text-red-700' : 'text-slate-500'}`}>{message.role === 'user' ? t('You') : t('Store Assistant')}</p>
                <p className="whitespace-pre-wrap">{message.role==='user'?message.text:t(message.text)}</p>
                {message.source && <p className="mt-2 border-t border-slate-100 pt-2 text-xs leading-5 text-slate-500">{message.source}</p>}
              </div>
            </div>)}
            {busy && <p role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">{t("Finding an answer\u2026")}</p>}
            <div ref={endRef} />
          </div>

          {messages.length <= 2 && <div className="mt-5"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Choose a question to get started")}</p><div className="grid gap-2">{suggestions.map(suggestion => <button key={suggestion} type="button" disabled={busy} onClick={() => send(t(suggestion))} className="min-h-12 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium leading-5 text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50">{t(suggestion)}</button>)}</div></div>}
        </div>

        <form className="border-t border-slate-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onSubmit={event => {
          event.preventDefault();
          send();
        }}>
          <label htmlFor="assistant-message" className="mb-2 block text-sm font-semibold text-slate-700">{t("Ask a question")}</label>
          <div className="flex items-end gap-2">
            <textarea id="assistant-message" aria-label={t("Message to Store Assistant")} maxLength={1000} rows={2} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }} placeholder={t("For example: Do we have brake pads?")} className="input max-h-28 min-h-12 resize-none" />
            <button type="submit" aria-label={t("Send message")} disabled={!text.trim() || busy} className="btn-primary grid h-12 w-12 shrink-0 place-items-center rounded-xl p-0"><ArrowUp aria-hidden="true" size={22} /></button>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">{t("Ask about a part, a sale, or how to use PartCast.")}</p>
        </form>
      </section>
    </div>, document.body)}
  </>;
}
