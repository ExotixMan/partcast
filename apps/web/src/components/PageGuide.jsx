import {useState} from 'react';
import {CircleHelp} from 'lucide-react';
import {t,useLocale} from '../context/LocaleContext.jsx';
import Modal from './Modal.jsx';

export default function PageGuide({title,children}){
  useLocale();
  const [open,setOpen]=useState(false);
  return <>
    <button type="button" className="btn-secondary" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><CircleHelp size={18} aria-hidden="true"/>{t('Quick guide')}</button>
    <Modal open={open} onClose={()=>setOpen(false)} title={t('Quick guide: {v0}',{v0:title})}
      footer={<button type="button" className="btn-primary" onClick={()=>setOpen(false)}>{t('Close guide')}</button>}>
      <div className="page-guide-content space-y-5 text-base leading-7 text-slate-600">{children}</div>
    </Modal>
  </>;
}
