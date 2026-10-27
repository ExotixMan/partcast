import {AlertTriangle} from 'lucide-react';
import {t,useLocale} from '../context/LocaleContext.jsx';
import Modal from './Modal.jsx';

export default function DeliveryQuantityWarning({warning,onCancel,onContinue}){
 useLocale();
 return <Modal open={Boolean(warning)} title="Large delivery quantity" description={t('This quantity is high for one item. Do you want to continue?')} onClose={onCancel} footer={<>
  <button type="button" className="btn-secondary" onClick={onCancel}>{t('Go back and edit')}</button>
  <button type="button" className="btn-primary" onClick={onContinue}>{t('Yes, continue')}</button>
 </>}>
  {warning&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
   <div className="flex items-start gap-3"><AlertTriangle size={24} className="mt-1 shrink-0 text-amber-800" aria-hidden="true"/><div className="min-w-0"><h3 className="line-clamp-2 break-words font-bold" title={warning.product.description}>{warning.product.description}</h3>{warning.product.part_number&&<p className="mt-1 break-words text-sm text-slate-600">{warning.product.part_number}</p>}</div></div>
   <p className="mt-4 text-sm text-slate-600">{t('Quantity to receive')}</p>
   <p className="mt-1 break-words text-3xl font-bold">{Number(warning.quantity).toLocaleString('en-PH')} {warning.product.unit||t('units')}</p>
  </div>}
 </Modal>;
}
