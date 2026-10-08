import { useEffect, useState } from 'react';
import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Loading from '../components/Loading.jsx';
import Toast from '../components/Toast.jsx';

const sizeLabel = size => size ? `${(Number(size) / 1024 / 1024).toFixed(2)} MB` : 'Size unavailable';
const dateLabel = date => date ? new Date(date).toLocaleString() : 'Date unavailable';

export default function BackupsPage() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  async function load() {
    setLoading(true); setError('');
    try { const result = await api.get('/api/admin/backups'); setRows(result.data || []); }
    catch (cause) { setError(cause.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.post('/api/admin/backups', {});
      setToast({ message: `Backup saved: ${result.backup.file_name}` });
      load();
    } catch (cause) { setToast({ type: 'error', message: cause.message }); }
    finally { setBusy(false); }
  }

  async function download(id) {
    if (downloading) return;
    setDownloading(id);
    try {
      const result = await api.get(`/api/admin/backups/${id}/download`);
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (cause) { setToast({ type: 'error', message: cause.message }); }
    finally { setDownloading(''); }
  }

  const downloadButton = row => row.status === 'created' ? <button className="btn-secondary w-full lg:w-auto" disabled={Boolean(downloading)} aria-label={`Download backup ${row.file_name}`} onClick={() => download(row.id)}><Download size={17} aria-hidden="true" />{downloading === row.id ? 'Preparing download…' : 'Download backup'}</button> : null;

  return <>
    <PageHeader title="Backup copies" subtitle="Save an extra copy of your store records, or download a copy you saved earlier."
      actions={<button className="btn-primary" onClick={create} disabled={busy}><RefreshCw size={17} aria-hidden="true" className={busy ? 'animate-spin' : ''} />{busy ? 'Saving backup…' : 'Save a backup now'}</button>} />
    <div className="mb-5 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><ShieldCheck className="mt-0.5 shrink-0 text-emerald-700" size={21} aria-hidden="true" /><p className="text-sm leading-6 text-emerald-900">Backups are private Excel files. An internet connection is needed to save or download them. Each download link expires after five minutes; you can request a new one here.</p></div>
    <section className="panel overflow-hidden" aria-busy={loading}><div className="panel-header"><h2 className="font-bold">Saved backups</h2></div>
      {loading ? <Loading label="Loading saved backups…" /> : error ? <div className="space-y-3 p-5" role="alert"><h3 className="font-semibold">Backups could not be loaded</h3><p className="text-sm text-red-700">{error}</p><button className="btn-secondary" onClick={load}>Try again</button></div> : !rows.length ? <EmptyState title="No backup copies yet" text="Choose “Save a backup now” to make your first copy of the store’s saved records." /> : <>
        <div className="divide-y divide-slate-100 lg:hidden">{rows.map(row => <article key={row.id} className="space-y-3 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="min-w-0 flex-1 break-all text-sm font-semibold text-slate-900">{row.file_name || 'Backup was not saved'}</h3><StatusBadge status={row.status} /></div><p className="text-sm text-slate-600">Saved {dateLabel(row.created_at)}</p><p className="text-sm text-slate-500">{sizeLabel(row.size_bytes)}</p>{downloadButton(row)}</article>)}</div>
        <div className="hidden overflow-x-auto lg:block"><table className="min-w-full text-left text-sm"><caption className="sr-only">Private saved backup files and their download actions</caption><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th scope="col" className="px-5 py-3">File name</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3">File size</th><th scope="col" className="px-4 py-3">Saved on</th><th scope="col" className="px-5 py-3 text-right">Download</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.id}><td className="px-5 py-4 font-medium">{row.file_name || 'Backup was not saved'}</td><td className="px-4 py-4"><StatusBadge status={row.status} /></td><td className="px-4 py-4 text-slate-600">{sizeLabel(row.size_bytes)}</td><td className="px-4 py-4 text-slate-600">{dateLabel(row.created_at)}</td><td className="px-5 py-4 text-right">{downloadButton(row)}</td></tr>)}</tbody></table></div>
      </>}
    </section>
    <Toast toast={toast} onClose={() => setToast(null)} />
  </>;
}
