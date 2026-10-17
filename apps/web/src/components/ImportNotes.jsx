import {t} from '../context/LocaleContext.jsx';

export default function ImportNotes({warnings,open=false}) {
  const notes=Array.isArray(warnings)?warnings.filter(value=>typeof value==='string'&&value.trim()):[];
  if(!notes.length)return null;
  return <details open={open} className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
    <summary className="cursor-pointer font-semibold">{t('Import notes ({v0})',{v0:notes.length})}</summary>
    <ul className="mt-2 max-h-64 list-disc space-y-2 overflow-auto break-words pl-5">{notes.map((note,index)=><li key={index}>{t(note)}</li>)}</ul>
  </details>;
}
