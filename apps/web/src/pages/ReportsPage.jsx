import { Boxes, Download, FileSpreadsheet, History, Truck } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api.js';
import PageHeader from '../components/PageHeader.jsx';
import Toast from '../components/Toast.jsx';

const reports = [
  { type: 'inventory', title: 'Inventory report', text: 'See which parts you have, how many are left, their shelf locations, and prices.', use: 'Useful for a stock check.', icon: Boxes },
  { type: 'transactions', title: 'Transaction report', text: 'Review received stock, sales, removed parts, and their reference numbers.', use: 'Useful for checking stock changes.', icon: History },
  { type: 'reorder', title: 'Reorder report', text: 'See parts that may need restocking, suggested quantities, suppliers, and estimated costs.', use: 'Useful for planning your next purchase.', icon: Truck }
];

export default function ReportsPage() {
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);

  async function download(type) {
    if (busy) return;
    setBusy(type);
    try {
      await api.download(`/api/reports/${type}.xlsx`);
      setToast({ message: 'Your report is ready. Check your device’s Downloads folder.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setBusy('');
    }
  }

  return <>
    <PageHeader title="Reports" subtitle="Choose a report to save a spreadsheet you can open, print, or share." />
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4"><FileSpreadsheet size={21} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" /><p className="text-sm leading-6 text-slate-600">Reports use the latest saved store data and need an internet connection. They download as Excel files (.xlsx).</p></div>
    <div className="grid gap-4 lg:grid-cols-3">{reports.map(report => <article className="panel flex flex-col p-5 sm:p-6" key={report.type}>
      <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><report.icon size={23} aria-hidden="true" /></div>
      <h2 className="text-lg font-bold text-slate-900">{report.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{report.text}</p><p className="mb-5 mt-3 text-sm font-medium text-slate-700">{report.use}</p>
      <button className="btn-primary mt-auto w-full" disabled={Boolean(busy)} aria-label={`Download Excel: ${report.title}`} onClick={() => download(report.type)}><Download size={17} aria-hidden="true" />{busy === report.type ? 'Preparing your report…' : 'Download Excel'}</button>
    </article>)}</div>
    <Toast toast={toast} onClose={() => setToast(null)} />
  </>;
}
