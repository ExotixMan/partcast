import { z } from 'zod';
export const amount = z.preprocess(v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')?v:NaN,z.coerce.number().finite().min(0).lt(1e12).refine(n=>Number(n.toFixed(2))===n,'Use at most 2 decimal places.'));
export const positiveAmount = amount.refine(n=>n>0,'Enter a value greater than zero.');
export const category = z.enum(['parts','lubricants','fuel','accessories','other']);
export const barcode = z.string().trim().max(80).regex(/^[A-Za-z0-9 ._/-]+$/,'Use letters, numbers, spaces, or . _ / - for a barcode.').nullable().optional();
const text=(n)=>z.string().trim().max(n).nullable().optional();
const dated = z.string().date().nullable().optional();
const common={client_operation_id:z.string().uuid(),occurred_at:z.string().datetime().optional(),notes:text(1000)};
const validNumber=n=>Number.isFinite(n)&&n>=0&&n<1e12&&Number(n.toFixed(2))===n;
const lineCents=(quantity,price)=>(BigInt(Math.round(quantity*100))*BigInt(Math.round(price*100))+50n)/100n;
export function validateSaleMovement(v,c){
 if(v.tx_type!=='sale')return;
 if(!(v.unit_price>0)){
  c.addIssue({code:'custom',path:['unit_price'],message:'Enter a selling price greater than zero for every part.'});
  return;
 }
 if(!validNumber(v.quantity)||!validNumber(v.unit_price))return;
 const cents=lineCents(v.quantity,v.unit_price);
 if(cents<1n)c.addIssue({code:'custom',path:['total_amount'],message:'The sale total must be at least ₱0.01. Check the quantities and prices.'});
 if(cents>=100000000000000n)c.addIssue({code:'custom',path:['total_amount'],message:'The total is too large.'});
 if(v.total_amount!=null&&validNumber(v.total_amount)&&BigInt(Math.round(v.total_amount*100))!==cents)c.addIssue({code:'custom',path:['total_amount'],message:'The sale total must match the quantity and selling price.'});
}
export const batchSchema=z.object({...common,kind:z.literal('batch').default('batch'),tx_type:z.enum(['sale','stock_in']),
 lines:z.array(z.object({product_id:z.string().uuid(),quantity:positiveAmount,unit_price:amount})).min(1).max(100).refine(xs=>new Set(xs.map(x=>x.product_id)).size===xs.length,'Each part must appear once.'),
 customer_name:text(240),phone:text(80),reference_no:text(180),supplier_id:z.string().uuid().nullable().optional(),
 is_credit:z.boolean().default(false),paid_amount:amount.default(0),due_date:z.unknown().optional()
}).superRefine((v,c)=>{
 if(v.tx_type==='sale')v.lines.forEach((l,i)=>validateSaleMovement({...l,tx_type:'sale'},{addIssue:issue=>c.addIssue({...issue,path:['lines',i,...issue.path.map(key=>key==='total_amount'?'unit_price':key)]})}));
 if(v.lines.some(l=>![l.quantity,l.unit_price].every(validNumber)))return;
 const cents=v.lines.reduce((sum,l)=>sum+lineCents(l.quantity,l.unit_price),0n);
 const total=Number(cents)/100;
 if(cents>=100000000000000n)c.addIssue({code:'custom',path:['lines'],message:'The total is too large.'});
 if(v.is_credit&&v.tx_type!=='sale')c.addIssue({code:'custom',path:['is_credit'],message:'Utang applies to customer sales only.'});
 if(v.is_credit&&(!v.customer_name||v.customer_name.length<2))c.addIssue({code:'custom',path:['customer_name'],message:'Enter the customer name for utang.'});
 if(v.is_credit&&v.paid_amount>total)c.addIssue({code:'custom',path:['paid_amount'],message:'Payment cannot exceed the sale total.'});
 if(v.tx_type==='sale'&&v.is_credit&&v.paid_amount<total){
  const due=dated.safeParse(v.due_date);
  if(!due.success)c.addIssue({code:'custom',path:['due_date'],message:'Choose a valid due date.'});
  else if(due.data){
   const occurred=Date.parse(v.occurred_at||new Date().toISOString());
   if(Number.isFinite(occurred)&&due.data<new Date(occurred+8*3600000).toISOString().slice(0,10))c.addIssue({code:'custom',path:['due_date'],message:'Due date must be on or after the sale date.'});
  }
 }
});
export const debtSchema=z.object({...common,kind:z.literal('debt').default('debt'),customer_name:z.string().trim().min(2).max(240),phone:text(80),principal:positiveAmount,due_date:dated,reference_no:text(180)});
export const paymentSchema=z.object({...common,kind:z.literal('payment').default('payment'),debt_id:z.string().uuid(),amount:positiveAmount});
export const supplierEmailSchema=z.object({
 client_request_id:z.string().uuid().optional(),expected_recipient:z.string().trim().email().max(254).optional(),
 subject:z.string().trim().min(2).max(180).refine(s=>!/[\r\n]/.test(s),'Use a single line for the subject.'),message:z.string().trim().min(2).max(2000),
 extra_columns:z.array(z.object({id:z.string().uuid(),label:z.string().trim().min(1).max(50).refine(s=>!/[\r\n]/.test(s),'Use a single line for a column name.')})).max(5).default([]),
 items:z.array(z.object({product_id:z.string().uuid(),part_number:z.string().trim().max(120),description:z.string().trim().min(2).max(500),unit:z.string().trim().max(40).optional(),quantity:positiveAmount,extra_values:z.record(z.string().uuid(),z.string().trim().max(300)).default({})})).min(1).max(100).refine(a=>new Set(a.map(x=>x.product_id)).size===a.length,'Each part must appear once.')
}).superRefine((draft,c)=>{
 const ids=new Set(draft.extra_columns.map(x=>x.id));
 const reserved=['part number','description','in stock','unit','quantity','numero ng piyesa','paglalarawan','nasa stock','yunit','dami'];
 if(draft.extra_columns.some(x=>reserved.includes(x.label.toLowerCase())))c.addIssue({code:'custom',path:['extra_columns'],message:'This column already exists in the email table.'});
 if(ids.size!==draft.extra_columns.length||new Set(draft.extra_columns.map(x=>x.label.toLowerCase())).size!==draft.extra_columns.length)c.addIssue({code:'custom',path:['extra_columns'],message:'Each column needs a unique name.'});
 if(draft.items.some(item=>Object.keys(item.extra_values).some(id=>!ids.has(id))))c.addIssue({code:'custom',path:['items'],message:'Use values only for the columns in this request.'});
});
export function reportDates(query){
 const from=query.from?z.string().date().parse(query.from):null,to=query.to?z.string().date().parse(query.to):null;
 if(from&&to&&from>to)throw Object.assign(new Error('Start date must be on or before end date.'),{status:422});

 return {from,to,start:from?new Date(`${from}T00:00:00+08:00`).toISOString():null,end:to?new Date(Date.parse(`${to}T00:00:00+08:00`)+86400000).toISOString():null};
}
export function dateQuery(builder,dates,column='occurred_at'){
 if(dates.start)builder=builder.gte(column,dates.start);if(dates.end)builder=builder.lt(column,dates.end);return builder;
}
