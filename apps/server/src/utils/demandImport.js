export const MAX_DEMAND_IMPORT_ROWS=50000;
export const MAX_DEMAND_CENTS=99999999999999;
export const demandImportDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date());

export function demandImportDate(value){
 let date;
 if(value instanceof Date)date=Number.isFinite(value.getTime())?value.toISOString().slice(0,10):null;
 else if(typeof value==='number'&&Number.isFinite(value)&&value>20000&&value<90000)date=new Date(Math.round((value-25569)*86400000)).toISOString().slice(0,10);
 else if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value.trim()))date=value.trim();
 if(!date)return null;
 const parsed=new Date(date+'T00:00:00.000Z');
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date?date:null;
}

export function demandImportCents(value){
 if(!['string','number'].includes(typeof value))return null;
 const text=String(value).trim();
 if(text.length>32||!/^\d+(?:\.\d{1,2})?$/.test(text))return null;
 const [whole,fraction='']=text.split('.');
 const cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 return cents<=BigInt(MAX_DEMAND_CENTS)?Number(cents):null;
}
