import { z } from 'zod';
export const amount = z.preprocess(v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')?v:NaN,z.coerce.number().finite().min(0).lt(1e12).refine(n=>Number(n.toFixed(2))===n,'Use at most 2 decimal places.'));
export const positiveAmount = amount.refine(n=>n>0,'Enter a value greater than zero.');
export const category = z.enum(['parts','lubricants','fuel','accessories','other']);
export const barcode = z.string().trim().max(80).regex(/^[A-Za-z0-9 ._/-]+$/,'Use letters, numbers, spaces, or . _ / - for a barcode.').nullable().optional();
const text=(n)=>z.string().trim().max(n).nullable().optional();
const dated = z.string().date().nullable().optional();
const common={client_operation_id:z.string().uuid(),occurred_at:z.string().datetime().optional(),notes:text(1000)};
export const batchSchema=z.object({...common,kind:z.literal('batch').default('batch'),tx_type:z.enum(['sale','stock_in']),
 lines:z.array(z.object({product_id:z.string().uuid(),quantity:positiveAmount,unit_price:amount})).min(1).max(100).refine(xs=>new Set(xs.map(x=>x.product_id)).size===xs.length,'Each part must appear once.'),
 customer_name:text(240),phone:text(80),reference_no:text(180),supplier_id:z.string().uuid().nullable().optional(),
 is_credit:z.boolean().default(false),paid_amount:amount.default(0),due_date:dated
}).superRefine((v,c)=>{
 if(v.lines.some(l=>![l.quantity,l.unit_price].every(n=>Number.isFinite(n)&&n>=0&&n<1e12&&Number(n.toFixed(2))===n)))return;
 const total=v.lines.reduce((s,l)=>s+Number((BigInt(Math.round(l.quantity*100))*BigInt(Math.round(l.unit_price*100))+50n)/100n),0)/100;
 if(total>=1e12)c.addIssue({code:'custom',path:['lines'],message:'The total is too large.'});
 if(v.is_credit&&v.tx_type!=='sale')c.addIssue({code:'custom',path:['is_credit'],message:'Utang applies to customer sales only.'});
 if(v.is_credit&&(!v.customer_name||v.customer_name.length<2))c.addIssue({code:'custom',path:['customer_name'],message:'Enter the customer name for utang.'});
 if(v.is_credit&&v.paid_amount>total)c.addIssue({code:'custom',path:['paid_amount'],message:'Payment cannot exceed the sale total.'});
});
export const debtSchema=z.object({...common,kind:z.literal('debt').default('debt'),customer_name:z.string().trim().min(2).max(240),phone:text(80),principal:positiveAmount,due_date:dated,reference_no:text(180)});
export const paymentSchema=z.object({...common,kind:z.literal('payment').default('payment'),debt_id:z.string().uuid(),amount:positiveAmount});
export const supplierEmailSchema=z.object({subject:z.string().trim().min(2).max(180).refine(s=>!/[\r\n]/.test(s),'Use a single line for the subject.'),message:z.string().trim().min(2).max(2000),items:z.array(z.object({product_id:z.string().uuid(),part_number:z.string().trim().max(120),description:z.string().trim().min(2).max(500),quantity:positiveAmount})).min(1).max(100).refine(a=>new Set(a.map(x=>x.product_id)).size===a.length,'Each part must appear once.')});
export function reportDates(query){
 const from=query.from?z.string().date().parse(query.from):null,to=query.to?z.string().date().parse(query.to):null;
 if(from&&to&&from>to)throw Object.assign(new Error('Start date must be on or before end date.'),{status:422});
 // Calendar dates follow store time in the Philippines; end date is inclusive.
 return {from,to,start:from?new Date(`${from}T00:00:00+08:00`).toISOString():null,end:to?new Date(Date.parse(`${to}T00:00:00+08:00`)+86400000).toISOString():null};
}
export function dateQuery(builder,dates,column='occurred_at'){
 if(dates.start)builder=builder.gte(column,dates.start);if(dates.end)builder=builder.lt(column,dates.end);return builder;
}
