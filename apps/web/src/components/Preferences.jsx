import {Sun,Moon,Check} from 'lucide-react';
import {useState} from 'react';
import {useLocale,t} from '../context/LocaleContext.jsx';
import Modal from './Modal.jsx';
export default function Preferences(){
 const {language,setLanguage,theme,setTheme,textSize,setTextSize}=useLocale();
 const [open,setOpen]=useState(false);
 const choice=(selected)=>`flex min-h-14 min-w-0 flex-wrap items-center justify-center gap-2 rounded-xl border px-3 py-3 text-base font-semibold ${selected?'border-red-600 bg-red-50 text-red-800':'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`;
 return <>
  <div className="flex items-center gap-2">
   <label><span className="sr-only">{t('Website language')}</span><select className="min-h-12 w-24 rounded-xl border border-slate-300 bg-white px-2 text-base text-slate-800 sm:w-28" value={language} onChange={e=>setLanguage(e.target.value)}><option value="en">English</option><option value="fil">Tagalog</option></select></label>
   <button className="flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 font-semibold text-slate-700 hover:bg-slate-50" aria-label={t('Text and display')} title={t('Text and display')} onClick={()=>setOpen(true)}><span className="text-lg font-bold" aria-hidden="true">Aa</span><span className="hidden xl:inline">{t('Display')}</span></button>
  </div>
  <Modal open={open} onClose={()=>setOpen(false)} title={t('Make PartCast easier to read')} description={t('Choose what feels comfortable. Your choice stays on this device.')} footer={<button className="btn-primary w-full sm:w-auto" onClick={()=>setOpen(false)}>{t('Done')}</button>}>
   <fieldset><legend className="mb-3 font-semibold text-slate-900">{t('Text size')}</legend><div className="grid grid-cols-2 gap-3">
    <button className={choice(textSize==='standard')} aria-pressed={textSize==='standard'} onClick={()=>setTextSize('standard')}>{textSize==='standard'&&<Check size={18} aria-hidden="true"/>}{t('Standard text')}</button>
    <button className={choice(textSize==='large')} aria-pressed={textSize==='large'} onClick={()=>setTextSize('large')}>{textSize==='large'&&<Check size={18} aria-hidden="true"/>}{t('Larger text')}</button>
   </div></fieldset>
   <fieldset className="mt-6"><legend className="mb-3 font-semibold text-slate-900">{t('Screen colour')}</legend><div className="grid grid-cols-2 gap-3">
    <button className={choice(theme==='light')} aria-label={t('Use light mode')} aria-pressed={theme==='light'} onClick={()=>setTheme('light')}><Sun size={20} aria-hidden="true"/>{t('Light')}</button>
    <button className={choice(theme==='dark')} aria-label={t('Use dark mode')} aria-pressed={theme==='dark'} onClick={()=>setTheme('dark')}><Moon size={20} aria-hidden="true"/>{t('Dark')}</button>
   </div></fieldset>
  </Modal>
 </>;
}
