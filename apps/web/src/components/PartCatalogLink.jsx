import {ExternalLink} from 'lucide-react';
import {t} from '../context/LocaleContext.jsx';

export default function PartCatalogLink({partNumber=''}){
  const code=String(partNumber||'').trim();
  return <a href={code?`https://partsouq.com/en/search/all?q=${encodeURIComponent(code)}`:'https://partsouq.com/'} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-red-700 underline decoration-red-200 underline-offset-4">
    <ExternalLink size={16}/>{code?t('Check this part on Partsouq'):t('Toyota parts reference · Partsouq')}
  </a>;
}
