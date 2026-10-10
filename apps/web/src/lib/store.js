export const categories=[['all','All categories'],['parts','Car parts'],['lubricants','Oils & lubricants'],['fuel','Gas & fuel'],['accessories','Accessories'],['other','Other']];
export const money=n=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(n||0));
export const validAmount=(n,positive=false)=>(typeof n==='number'||typeof n==='string'&&n.trim()!=='')&&Number.isFinite(Number(n))&&Number(n)>=0&&Number(n)<1e12&&Number(Number(n).toFixed(2))===Number(n)&&(!positive||Number(n)>0);
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const barcodeValid=s=>/^[A-Za-z0-9 ._/-]{1,80}$/.test(s.trim());

// Integer cents match PostgreSQL round(quantity * price, 2).
export const lineCents=(quantity,price)=>{if(!validAmount(quantity)||!validAmount(price))return NaN;return Number((BigInt(Math.round(Number(quantity)*100))*BigInt(Math.round(Number(price)*100))+50n)/100n);};
