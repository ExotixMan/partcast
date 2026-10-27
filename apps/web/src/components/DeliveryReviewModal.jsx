import {AlertTriangle,PackageCheck} from 'lucide-react';
import {t,useLocale} from '../context/LocaleContext.jsx';
import {money,validAmount} from '../lib/store.js';
import Modal from './Modal.jsx';

export default function DeliveryReviewModal({open,lines,total,onEdit,onConfirm,busy}){
 useLocale();
 return <Modal open={open} title="Confirm delivery" description={t('Have you received these items? Check the quantities before saving.')} onClose={onEdit} footer={<>
  <button type="button" className="btn-secondary" disabled={busy} onClick={onEdit}>{t('Go back and edit')}</button>
  <button type="button" className="btn-primary" disabled={busy} onClick={onConfirm}><PackageCheck size={20} className="shrink-0" aria-hidden="true"/>{t('Yes, receive these items')}</button>
 </>}>
  <div className="mb-4 flex items-center gap-2 text-amber-800"><AlertTriangle size={22} className="shrink-0" aria-hidden="true"/><p className="font-semibold">{t('Check these against the delivery receipt.')}</p></div>
  <dl className="mb-5 space-y-3 font-bold"><div className="flex flex-wrap justify-between gap-2"><dt>{t('Total units')}</dt><dd>{lines.reduce((sum,line)=>sum+Number(line.quantity),0).toLocaleString('en-PH')}</dd></div><div className="flex flex-wrap justify-between gap-2"><dt>{t('Total for all items')}</dt><dd>{money(total)}</dd></div></dl>
  <ul className="space-y-3">{lines.map(line=>{
   const stock=validAmount(line.product.current_stock)?Number(line.product.current_stock):null;
   const unit=line.product.unit||t('units');
   return <li key={line.product_id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
    <h3 className="line-clamp-2 break-words font-bold" title={line.product.description}>{line.product.description}</h3>
    {line.product.part_number&&<p className="mt-1 break-words text-sm text-slate-600">{line.product.part_number}</p>}
    <dl className="mt-3 space-y-2">
     <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><dt className="text-sm text-slate-600">{t('Quantity to receive')}</dt><dd className="min-w-0 max-w-full break-words text-lg font-bold">{Number(line.quantity).toLocaleString('en-PH')} {unit}</dd></div>
     <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><dt className="text-sm text-slate-600">{t('Stock after delivery')}</dt><dd className="min-w-0 max-w-full break-words font-semibold">{stock===null?'—':(stock+Number(line.quantity)).toLocaleString('en-PH',{maximumFractionDigits:2})} {unit}</dd></div>
    </dl>
   </li>;
  })}</ul>
 </Modal>;
}
