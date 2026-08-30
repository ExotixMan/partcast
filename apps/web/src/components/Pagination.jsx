import { ChevronLeft, ChevronRight } from 'lucide-react';
export default function Pagination({ page, pageSize, count=0, onPage }) {
  const pages=Math.max(1,Math.ceil(count/pageSize));
  return <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
    <p className="text-slate-500">Page <span className="font-semibold text-slate-800">{page}</span> of <span className="font-semibold text-slate-800">{pages}</span> · {count.toLocaleString()} records</p>
    <div className="flex gap-2"><button className="btn-secondary px-3 py-2" disabled={page<=1} onClick={()=>onPage(page-1)}><ChevronLeft size={16}/> Previous</button><button className="btn-secondary px-3 py-2" disabled={page>=pages} onClick={()=>onPage(page+1)}>Next <ChevronRight size={16}/></button></div>
  </div>;
}
