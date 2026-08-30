import { useEffect, useRef, useState } from 'react';
import { Bot, Send, Store, X } from 'lucide-react';
import { api } from '../lib/api.js';

const suggestions = [
  'Which items are out of stock?',
  'Which items should I restock?',
  'What are our best-selling parts?',
  'How are sales this month?'
];

export default function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Hi! I can help you check stock, sales, prices, restocking needs, suppliers, and expected demand for your store.'
    }
  ]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({
        behavior: 'smooth'
      });
    }
  }, [open, messages, busy]);

  async function send(value = text) {
    const message = String(value || '').trim();

    if (!message || busy) {
      return;
    }

    setText('');
    setMessages(current => [
      ...current,
      {
        role: 'user',
        text: message
      }
    ]);
    setBusy(true);

    try {
      const response = await api.post(
        '/api/assistant/chat',
        { message }
      );

      setMessages(current => [
        ...current,
        {
          role: 'assistant',
          text:
            response.answer ||
            'I could not find an answer from the current store records.'
        }
      ]);
    } catch (error) {
      setMessages(current => [
        ...current,
        {
          role: 'assistant',
          text: 'I could not check the store records right now. Please try again.'
        }
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        aria-label="Open Store Assistant"
        onClick={() => setOpen(true)}
        className={`fixed bottom-5 right-4 z-40 flex items-center gap-2 rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-black sm:right-6 ${
          open
            ? 'pointer-events-none scale-95 opacity-0'
            : 'opacity-100'
        }`}
      >
        <Bot size={19} />
        <span className="hidden sm:inline">
          Store Assistant
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-end bg-slate-950/25 p-0 sm:p-5"
          onClick={() => setOpen(false)}
        >
          <section
            className="flex h-[82vh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:h-[620px] sm:max-h-[82vh] sm:w-[410px] sm:rounded-2xl"
            onClick={event =>
              event.stopPropagation()
            }
          >
            <header className="flex items-center gap-3 border-b border-slate-200 bg-slate-950 px-4 py-4 text-white">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-red-600">
                <Store size={21} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  NPG Store Assistant
                </p>
                <p className="mt-0.5 text-xs text-slate-300">
                  Stock, sales & restocking help
                </p>
              </div>

              <button
                aria-label="Close Store Assistant"
                className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white"
                onClick={() => setOpen(false)}
              >
                <X size={19} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto bg-slate-50 p-4">
              <div className="space-y-3">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${
                      message.role === 'user'
                        ? 'justify-end'
                        : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${
                        message.role === 'user'
                          ? 'rounded-br-md bg-red-600 text-white'
                          : 'rounded-bl-md border border-slate-200 bg-white text-slate-700 shadow-sm'
                      }`}
                    >
                      {message.text}
                    </div>
                  </div>
                ))}

                {busy && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-500">
                      Checking store records...
                    </div>
                  </div>
                )}

                <div ref={endRef} />
              </div>

              {messages.length <= 2 && (
                <div className="mt-4 grid gap-2">
                  {suggestions.map(suggestion => (
                    <button
                      key={suggestion}
                      onClick={() => send(suggestion)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form
              className="border-t border-slate-200 bg-white p-3"
              onSubmit={event => {
                event.preventDefault();
                send();
              }}
            >
              <div className="flex items-end gap-2">
                <textarea
                  rows={1}
                  value={text}
                  onChange={event =>
                    setText(event.target.value)
                  }
                  onKeyDown={event => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey
                    ) {
                      event.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Ask about stock, sales, prices, or restocking..."
                  className="input max-h-28 resize-none"
                />

                <button
                  type="submit"
                  aria-label="Send message"
                  disabled={!text.trim() || busy}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <Send size={18} />
                </button>
              </div>

              <p className="mt-2 text-[11px] leading-4 text-slate-400">
                Answers are based on the store's current inventory and available sales records.
              </p>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
