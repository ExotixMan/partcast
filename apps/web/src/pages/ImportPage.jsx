import { useEffect, useState } from 'react';
import { FileSpreadsheet, UploadCloud, TriangleAlert, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api.js';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Loading from '../components/Loading.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Toast from '../components/Toast.jsx';

const typeLabel = { auto: 'Choose automatically (recommended)', inventory: 'Inventory and purchases', 'legacy-sales': 'Past sales and customer records', 'demand-training': 'Sales quantities for forecasting' };
const dateLabel = value => value ? new Date(value).toLocaleString() : 'Date unavailable';

export default function ImportPage() {
  const [files, setFiles] = useState([]);
  const [kind, setKind] = useState('auto');
  const [useProxy, setUseProxy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [toast, setToast] = useState(null);
  const [results, setResults] = useState([]);

  async function load() {
    setHistoryLoading(true); setHistoryError('');
    try {
      const result = await api.get('/api/imports');
      setHistory(Array.isArray(result?.data) ? result.data : []);
    } catch (cause) { setHistoryError(cause.message); }
    finally { setHistoryLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function send() {
    if (!files.length || busy) return;
    setBusy(true); setResults([]);
    const done = [];
    try {
      for (const file of files) {
        const data = new FormData();
        data.append('file', file); data.append('kind', kind); data.append('useProxy', String(useProxy));
        try {
          const result = await api.post('/api/imports/spreadsheet', data);
          done.push({ file: file.name, ok: true, ...result });
        } catch (cause) { done.push({ file: file.name, ok: false, error: cause.message }); }
      }
      setResults(done);
      const successful = done.filter(result => result.ok).length;
      setToast({ type: successful === done.length ? 'success' : 'error', message: `${successful} of ${done.length} files imported. Review the results below.` });
      load();
    } finally { setBusy(false); }
  }

  return <>
    <PageHeader title="Import spreadsheets" subtitle="Add existing stock or sales records from an Excel or CSV file." />
    <section className="panel p-5 sm:p-6"><div className="grid gap-6 lg:grid-cols-2">
      <div><div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><FileSpreadsheet size={23} aria-hidden="true" /></div><div><h2 className="text-lg font-bold">1. Choose your files</h2><p id="import-file-help" className="mt-1 text-sm leading-6 text-slate-600">Supported files: Excel (.xlsx or .xlsm) and CSV (.csv).</p></div></div>
        <label className="mt-5 block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-emerald-500 hover:bg-emerald-50 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-emerald-700" htmlFor="import-files"><UploadCloud className="mx-auto text-slate-500" size={30} aria-hidden="true" /><span className="mt-3 block font-semibold text-slate-900">Choose spreadsheet files</span><span className="mt-2 block text-sm leading-6 text-slate-600">You can select more than one file.</span><input id="import-files" type="file" multiple disabled={busy} aria-describedby="import-file-help" accept=".xlsx,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="sr-only" onChange={event => setFiles([...event.target.files])} /></label>
        {!!files.length && <div className="mt-4 rounded-xl bg-slate-50 p-4"><p className="text-sm font-semibold text-slate-900" role="status">{files.length} {files.length === 1 ? 'file selected' : 'files selected'}</p><ul className="mt-2 space-y-2 text-sm text-slate-600">{files.map((file, index) => <li className="break-all" key={`${file.name}-${index}`}>{file.name}</li>)}</ul></div>}
      </div>
      <div className="space-y-4"><h2 className="text-lg font-bold">2. Check and import</h2><label className="block" htmlFor="import-type"><span className="label">What is in these files?</span><select id="import-type" className="input" disabled={busy} value={kind} onChange={event => setKind(event.target.value)}>{Object.entries(typeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <p className="text-sm leading-6 text-slate-600">Choose automatically if you are unsure. PartCast checks the column names to find stock records, sales, or forecasting quantities.</p>
        {(kind === 'legacy-sales' || kind === 'auto') && <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700">Advanced: sales with missing quantities</summary><label className="mt-4 flex items-start gap-3" htmlFor="import-sales-proxy"><input id="import-sales-proxy" className="mt-1 size-5 shrink-0" type="checkbox" disabled={busy} checked={useProxy} onChange={event => setUseProxy(event.target.checked)} /><span><span className="block text-sm font-semibold text-amber-900">Estimate one sold unit when a quantity is missing</span><span className="mt-1 block text-sm leading-6 text-amber-800">Leave this off when actual sold quantities are available. Estimates can make forecasts less reliable.</span></span></label></details>}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Imported records are saved to your store. Check that you selected the correct files before continuing. An internet connection is needed.</div>
        <button className="btn-primary w-full" disabled={!files.length || busy} onClick={send}><UploadCloud size={17} aria-hidden="true" />{busy ? 'Importing your files…' : `Import ${files.length || 'selected'} ${files.length === 1 ? 'file' : 'files'}`}</button>
      </div>
    </div></section>
    {results.length > 0 && <section className="panel mt-5 overflow-hidden" aria-label="Latest import results"><div className="panel-header"><h2 className="font-bold">Import results</h2></div><div className="divide-y divide-slate-100">{results.map((result, index) => <div key={`${result.file}-${index}`} className="flex items-start gap-3 px-5 py-4">{result.ok ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={21} aria-hidden="true" /> : <TriangleAlert className="mt-0.5 shrink-0 text-red-600" size={21} aria-hidden="true" />}<div className="min-w-0"><h3 className="break-all text-sm font-semibold text-slate-900">{result.file}</h3>{result.ok ? <p className="mt-2 text-sm leading-6 text-slate-600">Imported successfully: {result.rowsImported} rows added and {result.rowsSkipped} skipped.{result.selectedSheet ? ` Used sheet: ${result.selectedSheet}.` : ''}{result.snapshotSheet ? ` Stock sheet: ${result.snapshotSheet}.` : ''}</p> : <p className="mt-2 text-sm leading-6 text-red-700">Not imported: {result.error}</p>}</div></div>)}</div></section>}
    <div className="mt-5 flex gap-3 rounded-xl border border-slate-200 bg-white p-4"><TriangleAlert className="mt-0.5 shrink-0 text-slate-600" size={21} aria-hidden="true" /><p className="text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-900">For better forecasts:</span> import inventory first, then past sales, then your prepared forecasting spreadsheet. Use actual quantities sold, dates, and matching part numbers.</p></div>
    <section className="panel mt-5 overflow-hidden" aria-busy={historyLoading}><div className="panel-header"><h2 className="font-bold">Past imports</h2></div>
      {historyLoading ? <Loading label="Loading past imports…" /> : historyError ? <div className="space-y-3 p-5" role="alert"><h3 className="font-semibold">Past imports could not be loaded</h3><p className="text-sm text-red-700">{historyError}</p><button className="btn-secondary" onClick={load}>Try again</button></div> : !history.length ? <EmptyState title="No files imported yet" text="Choose your first spreadsheet above. Its import result will be recorded here." /> : <>
        <div className="divide-y divide-slate-100 lg:hidden">{history.map(row => <article className="space-y-3 p-5" key={row.id}><div className="flex flex-wrap items-start justify-between gap-3"><h3 className="min-w-0 flex-1 break-all text-sm font-semibold">{row.file_name}</h3><StatusBadge status={row.status} /></div><p className="text-sm text-slate-600">{typeLabel[row.import_type] || String(row.import_type || 'Spreadsheet').replaceAll('_', ' ').replaceAll('-', ' ')}</p><p className="text-sm text-slate-600">{row.rows_imported} rows added · {row.rows_read} rows checked</p><p className="text-sm text-slate-500">{dateLabel(row.created_at)}</p></article>)}</div>
        <div className="hidden overflow-x-auto lg:block"><table className="min-w-full text-left text-sm"><caption className="sr-only">Previously imported files and the number of saved rows</caption><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th scope="col" className="px-5 py-3">File name</th><th scope="col" className="px-4 py-3">Contents</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3 text-right">Rows checked</th><th scope="col" className="px-4 py-3 text-right">Rows added</th><th scope="col" className="px-5 py-3">Imported on</th></tr></thead><tbody className="divide-y divide-slate-100">{history.map(row => <tr key={row.id}><td className="px-5 py-4 font-medium">{row.file_name}</td><td className="px-4 py-4 text-slate-600">{typeLabel[row.import_type] || String(row.import_type || 'Spreadsheet').replaceAll('_', ' ').replaceAll('-', ' ')}</td><td className="px-4 py-4"><StatusBadge status={row.status} /></td><td className="px-4 py-4 text-right">{row.rows_read}</td><td className="px-4 py-4 text-right">{row.rows_imported}</td><td className="px-5 py-4 text-slate-500">{dateLabel(row.created_at)}</td></tr>)}</tbody></table></div>
      </>}
    </section>
    <Toast toast={toast} onClose={() => setToast(null)} />
  </>;
}
