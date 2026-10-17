// Synonyms describe the same item; related components are kept separate.
export const partTerms=[
 {term:'coolant',names:['coolant','antifreeze','cooling fluid','radiator fluid','radiator coolant','tubig ng radiator','tubig radiator']},
 {term:'radiator',names:['radiator','radiyador']},
 {term:'engine oil',names:['engine oil','motor oil','langis ng makina','langis makina']},
 {term:'spark plug',names:['spark plug','sparkplug','buji']},
 {term:'brake pad',names:['brake pad','brake pads','pastilyas','disc brake pad']},
 {term:'brake shoe',names:['brake shoe','brake shoes','drum brake shoe']},
 {term:'air filter',names:['air filter','air cleaner','filter ng hangin']},
 {term:'oil filter',names:['oil filter','filter ng langis']},
 {term:'fuel filter',names:['fuel filter','gasoline filter','filter ng gasolina']},
 {term:'battery',names:['battery','baterya']},
 {term:'tire',names:['tire','tyre','gulong']},
 {term:'clutch',names:['clutch','klats']}
];
export const isTagalog=q=>/\b(magkano|meron|mayroon|ilang|ilan|saan|ano|paano|benta|ubos|kulang|langis|gulong|utang|po|ba|ng|natin|kailangan|pareho|tubig|baterya)\b/i.test(q)||/^may\s+.+/i.test(q);
export function partMatches(q){
 const text=q.toLowerCase();let matches=partTerms.filter(p=>p.names.some(n=>new RegExp(`\\b${n}\\b`,'i').test(text)));
 if(matches.some(p=>p.term==='coolant')){
 const withoutFluidNames=text.replace(/radiator fluid|radiator coolant|tubig ng radiator|tubig radiator/g,'');
 if(!/\bradiator\b|radiyador/.test(withoutFluidNames))matches=matches.filter(p=>p.term!=='radiator');
 }
 return matches;
}
export function normalizeQuestion(message){
 let q=message.toLowerCase();if(isTagalog(message))q=q.replace(/\bmay\b/g,'available');
 for(const p of partTerms){for(const name of [...p.names].sort((a,b)=>b.length-a.length))q=q.replace(new RegExp(`\\b${name}\\b`,'g'),p.term);}
 const swaps=[[/magkano|presyo/g,'price'],[/ubos|wala nang stock|walang stock/g,'out of stock'],[/kulang|kaunti na|konti na/g,'low stock'],[/kailangang iorder|kailangan.*dagdagan|oorderin|mag.?restock/g,'restock'],[/\b(?:naibenta|nabenta|benta)\b/g,'sales'],[/ngayon/g,'today'],[/linggo/g,'week'],[/buwan/g,'month'],[/\b(?:nasaan|saan)\b/g,'where'],[/\b(?:meron|mayroon|may stock)\b/g,'available'],[/\b(?:ilang|ilan|dami)\b/g,'quantity']];
 for(const [re,word] of swaps)q=q.replace(re,word);
 return q;
}
export function explainParts(message,fil=false){
 const q=message.toLowerCase();
 if(/coolant|antifreeze|tubig.*radiator/.test(q)&&/radiator|radiyador/.test(q)&&/same|pareho|different|kaibahan|term|equals|katulad/.test(q))return fil?'Ang coolant (radiator fluid o antifreeze) ay likidong pampalamig. Ang radiator ay piyesa na nagpapalamig sa likido. Magkaugnay sila pero magkaibang produkto; itanong kung coolant fluid o radiator assembly ang kailangan.':'Coolant, radiator fluid, and antifreeze refer to cooling fluid. A radiator is the component that cools the fluid. They are related but different products; confirm whether you need coolant fluid or a radiator assembly.';
 const matches=partMatches(q);
 if(matches.length&&/\b(?:what is|what does|meaning|ano ang|ano yung|terminology|tawag|ibig sabihin)\b/.test(q)){
 const p=matches[0];return fil?`${p.term}: mga karaniwang tawag ay ${p.names.join(', ')}. Gamitin ang alinman dito sa paghahanap. Tiyakin ang tamang sukat at modelo ng sasakyan bago bumili.`:`Common names for ${p.term}: ${p.names.join(', ')}. You can use these names to search. Confirm the vehicle model and size before buying.`;
 }
 return null;
}
export function productTerms(message){
 const matches=partMatches(message);return matches.length?[...new Set(matches.flatMap(p=>[p.term,...p.names]))]:[];
}
