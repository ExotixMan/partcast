import Modal from './Modal.jsx';
import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useState } from 'react';
import { Camera, Package, X } from 'lucide-react';
import { api } from '../lib/api.js';
export function ProductImage({
  path,
  description = '',
  className = 'h-16 w-16'
}) {
  useLocale();
  const [url, setUrl] = useState('');
  useEffect(() => {
    let live = true,
      objectURL;
    setUrl('');
    if (path) api.photo(`/api/photos/${path}`).then(blob => {
      objectURL = URL.createObjectURL(blob);
      if (live) setUrl(objectURL);else URL.revokeObjectURL(objectURL);
    }).catch(() => {});
    return () => {
      live = false;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [path]);
  return url ? <img src={url} alt={description} className={`${className} rounded-xl border border-slate-200 bg-white object-contain p-1`} /> : <span className={`${className} flex shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500`}><Package size={24} aria-label={t("No saved photo")} /></span>;
}
export default function ProductPhotos({
  productId,
  paths = [],
  onChange
}) {
  useLocale();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function upload(e) {
    const files = [...e.target.files];
    e.target.value = '';
    if (busy || !files.length) return;
    setError('');
    if (files.length + paths.length > 4) {
      setError('A part can have up to 4 photos.');
      return;
    }
    if (files.some(f => f.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(f.type))) {
      setError('Choose JPEG, PNG, or WebP photos under 5 MB.');
      return;
    }
    setBusy(true);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        const result = await api.post(`/api/photos/${productId}`, form);
        onChange(result.photo_paths);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(path) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.delete(`/api/photos/${path}`);
      onChange(r.photo_paths);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return <section className="space-y-3"><h3 className="font-semibold">{t("Part photos")}</h3><p className="text-sm text-slate-500">{t("Up to 4 photos. Photos you view are available offline on this device for up to 12 hours.")}</p>
 {error && <p role="alert" className="text-red-700">{t(error)}</p>}<div className="flex flex-wrap gap-3">{paths.map(path => <div className="relative" key={path}><ProductImage path={path} className="h-24 w-24" /><button type="button" className="absolute right-0 top-0 rounded-full bg-white p-2 text-red-700" disabled={busy || !navigator.onLine} onClick={() => remove(path)} aria-label={t("Remove photo")}><X size={16} /></button></div>)}</div>
 <label className={`btn-secondary ${busy || paths.length >= 4 || !navigator.onLine ? 'opacity-50' : ''}`}><Camera size={18} />{busy ? t('Saving photos…') : t('Add photos')}<input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || paths.length >= 4 || !navigator.onLine} onChange={upload} /></label>
 </section>;
}

export function ProductThumbnail({product,className='h-16 w-16'}){
 const [open,setOpen]=useState(false);useLocale();
 if(!product.photo_paths?.length)return <ProductImage description={product.description} className={className}/>;
 return <><button type="button" className="shrink-0" aria-label={t('View photos of {v0}',{v0:product.description})} onClick={()=>setOpen(true)}><ProductImage path={product.photo_paths[0]} description={product.description} className={className}/><span className="mt-1 block text-xs font-semibold text-red-700">{t("View photos")}</span></button>
 <Modal open={open} onClose={()=>setOpen(false)} title={product.description} description={t('Part photos. Only photos previously viewed on this device are available offline.')} size="lg"><div className="grid gap-4 sm:grid-cols-2">{product.photo_paths.map(path=><ProductImage key={path} path={path} description={product.description} className="aspect-square w-full"/>)}</div></Modal></>;
}
