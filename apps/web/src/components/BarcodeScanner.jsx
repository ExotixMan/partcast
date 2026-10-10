import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { barcodeValid } from '../lib/store.js';
export default function BarcodeScanner({
  open,
  onClose,
  onScan
}) {
  useLocale();
  const video = useRef(null),
    [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [camera, setCamera] = useState(false);
  const scanRef = useRef(onScan);
  scanRef.current = onScan;
  useEffect(() => {
    if (!open) {
      setCamera(false);
      setError('');
      setCode('');
      return;
    }
  }, [open]);
  useEffect(() => {
    if (!open || !camera) return;
    let live = true,
      controls;
    (async()=>{const {BrowserMultiFormatReader}=await import('@zxing/browser');if(!live)return;const reader=new BrowserMultiFormatReader();
    controls=await reader.decodeFromConstraints({
      video: {
        facingMode: 'environment',
        width: {
          ideal: 1280
        }
      },
      audio: false
    }, video.current, result => {
      if (result && live) {
        live = false;
        controls?.stop();
        setCamera(false);
        const value = result.getText();
        if (barcodeValid(value)) scanRef.current(value);else setError('This barcode is too long or uses unsupported characters. Enter the part number instead.');
      }
    });if(!live)controls.stop();
    })().catch(() => {
      if (live) {
        setError('Camera unavailable. Allow camera access, or type the barcode below.');
        setCamera(false);
      }
    });
    return () => {
      live = false;
      controls?.stop();
      const stream = video.current?.srcObject;
      stream?.getTracks?.().forEach(t => t.stop());
    };
  }, [open, camera]);
  function submit(e) {
    e.preventDefault();
    if (!barcodeValid(code)) {
      setError('Enter a barcode with 1 to 80 letters or numbers.');
      return;
    }
    setCamera(false);
    onScan(code.trim());
  }
  return <Modal open={open} onClose={onClose} title={t("Scan a barcode")} description={t("Scan the code on the box, use a USB scanner, or type it below.")}><div className="space-y-4">
 {error && <p role="alert" className="text-red-700">{t(error)}</p>}
 <button className="btn-secondary w-full" onClick={() => {
        setError('');
        setCamera(!camera);
      }}>{camera ? t('Stop camera') : t('Use camera')}</button>
 {camera && <video ref={video} muted playsInline className="w-full rounded-xl bg-slate-900" aria-label={t("Barcode camera")} />}
 <form onSubmit={submit} className="space-y-3"><label className="label" htmlFor="barcode-entry">{t("Barcode number")}</label><input id="barcode-entry" className="input" autoComplete="off" maxLength={80} value={code} onChange={e => setCode(e.target.value)} required /><button className="btn-primary w-full">{t("Find this barcode")}</button></form>
 <p className="text-sm text-slate-500">{t("A saved barcode finds its part and photos. A new barcode needs the part details first.")}</p>
 </div></Modal>;
}
