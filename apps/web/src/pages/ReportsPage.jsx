import { t, useLocale } from "../context/LocaleContext.jsx";
import { Boxes, Download, FileSpreadsheet, History, Truck } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api.js';
import PageHeader from '../components/PageHeader.jsx';
import { categories, today } from '../lib/store.js';
import Toast from '../components/Toast.jsx';
const reports = [{
  type: 'sales',
  title: 'Sales totals',
  text: 'Export daily totals and every part sold within your chosen dates.',
  use: 'Useful for checking your sales.',
  icon: History
}, {
  type: 'debts',
  title: 'Customer utang report',
  text: 'Export customer balances, due dates, and recorded payments.',
  use: 'Useful for following up balances.',
  icon: History
}, {
  type: 'inventory',
  title: 'Inventory report',
  text: 'See which parts you have, how many are left, their shelf locations, and prices.',
  use: 'Useful for a stock check.',
  icon: Boxes
}, {
  type: 'transactions',
  title: 'Transaction report',
  text: 'Review received stock, sales, removed parts, and their reference numbers.',
  use: 'Useful for checking stock changes.',
  icon: History
}, {
  type: 'reorder',
  title: 'Reorder report',
  text: 'See parts that may need restocking, suggested quantities, suppliers, and estimated costs.',
  use: 'Useful for planning your next purchase.',
  icon: Truck
}];
export default function ReportsPage() {
  useLocale();
  const [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [category, setCategory] = useState('all');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  async function download(type) {
    if (busy) return;
    if (from && to && from > to) {
      setToast({
        type: 'error',
        message: 'Start date must be on or before end date.'
      });
      return;
    }
    setBusy(type);
    try {
      await api.download(`/api/reports/${type}.xlsx?${new URLSearchParams({
        from,
        to,
        category: type === 'reorder' || type === 'debts' ? 'all' : category
      })}`);
      setToast({
        message: 'Your report is ready. Check your device’s Downloads folder.'
      });
    } catch (error) {
      setToast({
        type: 'error',
        message: error.message
      });
    } finally {
      setBusy('');
    }
  }
  return <>
    <PageHeader title={t("Reports")} subtitle={t("Choose a report to save a spreadsheet you can open, print, or share.")} />
    <section className="panel mb-5 p-5"><h2 className="mb-3 font-semibold">{t("Choose dates and category")}</h2><div className="grid gap-4 sm:grid-cols-3"><label><span className="label">{t("Start date")}</span><input type="date" className="input" max={to || today()} value={from} onChange={e => setFrom(e.target.value)} /></label><label><span className="label">{t("End date")}</span><input type="date" className="input" min={from || undefined} max={today()} value={to} onChange={e => setTo(e.target.value)} /></label><label><span className="label">{t("Category")}</span><select className="input" value={category} onChange={e => setCategory(e.target.value)}>{categories.map(([id, label]) => <option value={id} key={id}>{t(label)}</option>)}</select></label></div><p className="mt-3 text-sm text-slate-500">{t("Leave dates blank for all records. Dates follow Philippines time. Inventory quantities are current; its stock changes sheet uses your dates. Restock suggestions use current stock. Customer balances use the debt date and include payments recorded so far.")}</p></section>
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4"><FileSpreadsheet size={21} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" /><p className="text-sm leading-6 text-slate-600">{t("Reports use the latest saved store data and need an internet connection. They download as Excel files (.xlsx).")}</p></div>
    <div className="grid gap-4 lg:grid-cols-3">{reports.map(report => <article className="panel flex flex-col p-5 sm:p-6" key={report.type}>
      <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><report.icon size={23} aria-hidden="true" /></div>
      <h2 className="text-lg font-bold text-slate-900">{t(report.title)}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{t(report.text)}</p><p className="mb-5 mt-3 text-sm font-medium text-slate-700">{t(report.use)}</p>
      <button className="btn-primary mt-auto w-full" disabled={Boolean(busy)} aria-label={t("Download Excel: {v0}", {
          v0: t(report.title)
        })} onClick={() => download(report.type)}><Download size={17} aria-hidden="true" />{busy === report.type ? t('Preparing your report…') : t('Download Excel')}</button>
    </article>)}</div>
    <Toast toast={toast} onClose={() => setToast(null)} />
  </>;
}
