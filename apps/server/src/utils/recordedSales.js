import {z} from 'zod';

const actualSources = new Set(['actual_sale','imported_training_data']);
const calendarDay = z.string().date();
const invalidRange = message => Object.assign(new Error(message),{status:422,safe:true});

// Summarize supplied records only. No calendar filling, rates, future estimates
// or transaction-count proxies belong in this view.
export function summarizeRecordedSales(observations,{from=null,to=null,asOfDate}) {
  calendarDay.parse(asOfDate);
  if(from)calendarDay.parse(from);
  if(to)calendarDay.parse(to);
  const end=to||asOfDate;
  if(end>asOfDate)throw invalidRange('Choose an end date on or before today.');
  if(from&&from>end)throw invalidRange('Start date must be on or before end date.');
  const grouped=new Map();
  const sources={actual_sale:0,imported_training_data:0};
  let invalid=0,future=0,records=0,first=null,last=null;
  for(const row of observations) {
    if(!actualSources.has(row.source))continue;
    const q=row.quantity;
    const quantity=typeof q==='number'||typeof q==='string'&&q.trim()!==''?Number(q):NaN;
    if(!row.product_id||!calendarDay.safeParse(row.occurred_on).success||!Number.isFinite(quantity)||quantity<=0||Number(quantity.toFixed(4))!==quantity||!Number.isSafeInteger(Math.round(quantity*10000))) {
      invalid++;continue;
    }
    if(row.occurred_on>asOfDate){future++;continue;}
    if(from&&row.occurred_on<from||row.occurred_on>end)continue;
    const product=row.product||{};
    let current=grouped.get(row.product_id);
    if(!current) {
      current={product_id:row.product_id,part_number:product.part_number||null,description:product.description||null,unit:product.unit||null,
        quantity:0n,days:new Set(),record_count:0,actual_records:0,imported_records:0,first_sale_date:row.occurred_on,last_sale_date:row.occurred_on};
      grouped.set(row.product_id,current);
    }
    current.quantity+=BigInt(Math.round(quantity*10000));
    current.days.add(row.occurred_on);current.record_count++;
    current[row.source==='actual_sale'?'actual_records':'imported_records']++;
    current.first_sale_date=row.occurred_on<current.first_sale_date?row.occurred_on:current.first_sale_date;
    current.last_sale_date=row.occurred_on>current.last_sale_date?row.occurred_on:current.last_sale_date;
    first=first===null||row.occurred_on<first?row.occurred_on:first;
    last=last===null||row.occurred_on>last?row.occurred_on:last;
    records++;sources[row.source]++;
  }
  const data=[...grouped.values()].map(({quantity,days,...row})=>({...row,recorded_quantity:Number(quantity)/10000,sale_days:days.size}))
    .sort((a,b)=>b.last_sale_date.localeCompare(a.last_sale_date)||(a.part_number||a.product_id).localeCompare(b.part_number||b.product_id));
  return {mode:'recorded_sales',as_of_date:asOfDate,range:{from,to:end},record_count:records,part_count:data.length,
    first_sale_date:first,last_sale_date:last,source_counts:sources,invalid_records:invalid,future_records:future,
    includes_forecasts:false,missing_days_filled:false,data};
}
