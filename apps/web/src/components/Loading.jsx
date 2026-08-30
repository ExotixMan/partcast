import { LoaderCircle } from 'lucide-react';
export default function Loading({ label='Loading data...' }) { return <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={20}/>{label}</div>; }
