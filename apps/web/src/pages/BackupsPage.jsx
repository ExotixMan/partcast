import { useEffect, useState } from 'react';
import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Toast from '../components/Toast.jsx';

export default function BackupsPage() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = () =>
    api.get('/api/admin/backups')
      .then(r => setRows(r.data || []))
      .catch(e =>
        setToast({
          type: 'error',
          message: e.message
        })
      );

  useEffect(() => {
    load();
  }, []);

  async function create() {
    setBusy(true);

    try {
      const r = await api.post('/api/admin/backups', {});

      setToast({
        message: `Backup created: ${r.backup.file_name}`
      });

      load();
    } catch (e) {
      setToast({
        type: 'error',
        message: e.message
      });
    } finally {
      setBusy(false);
    }
  }

  async function download(id) {
    try {
      const r = await api.get(`/api/admin/backups/${id}/download`);

      window.open(
        r.url,
        '_blank',
        'noopener,noreferrer'
      );
    } catch (e) {
      setToast({
        type: 'error',
        message: e.message
      });
    }
  }

  return (
    <>
      <PageHeader
        title="Excel Backups"
        subtitle="Private, server-generated Excel backups stored in the protected Supabase Storage bucket."
        actions={
          <button
            className="btn-primary"
            onClick={create}
            disabled={busy}
          >
            <RefreshCw
              size={16}
              className={busy ? 'animate-spin' : ''}
            />

            {busy ? 'Creating...' : 'Create backup now'}
          </button>
        }
      />

      <div className="mb-5 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <ShieldCheck
          className="mt-0.5 shrink-0 text-emerald-700"
          size={19}
        />

        <p className="text-sm leading-6 text-emerald-900">
          Backup files are not public. Downloads use a temporary signed
          link that expires after five minutes. The scheduled job can
          generate backups automatically every day.
        </p>
      </div>

      <section className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">File</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="px-5 py-3 font-medium">
                    {r.file_name || 'Backup failed'}
                  </td>

                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {r.size_bytes
                      ? `${(Number(r.size_bytes) / 1024 / 1024).toFixed(2)} MB`
                      : '—'}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {new Date(r.created_at).toLocaleString()}
                  </td>

                  <td className="px-5 py-3 text-right">
                    {r.status === 'created' && (
                      <button
                        className="btn-secondary px-3 py-2"
                        onClick={() => download(r.id)}
                      >
                        <Download size={15} />
                        Download
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!rows.length && (
            <p className="p-10 text-center text-sm text-slate-500">
              No backups have been generated yet.
            </p>
          )}
        </div>
      </section>

      <Toast
        toast={toast}
        onClose={() => setToast(null)}
      />
    </>
  );
}