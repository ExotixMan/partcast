import {z} from 'zod';

export const searchText=z.string().trim().max(120).regex(/^[^\u0000-\u001f\u007f]*$/u,'Use a single line for your search.').default('');
const integer=(fallback,max)=>z.union([z.string().trim().min(1),z.number()]).pipe(z.coerce.number().finite().int().min(1).max(max)).default(fallback);
export const paginationQuery=z.object({page:integer(1,500000),pageSize:integer(25,100)});
export const invoicePaginationQuery=z.object({page:integer(1,500000),pageSize:integer(20,50)});

export function literalSearchFilter(columns,terms){
 if(!columns.length||columns.some(column=>!/^[a-z_][a-z0-9_]*$/.test(column)))throw new Error('Invalid search columns.');
 return terms.map(term=>searchText.parse(term)).filter(Boolean).flatMap(term=>{
  const pattern=term.replace(/[\\^$.*+?()[\]{}|]/g,'\\$&');
  const quoted='"'+pattern.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
  return columns.map(column=>`${column}.imatch.${quoted}`);
 }).join(',');
}
