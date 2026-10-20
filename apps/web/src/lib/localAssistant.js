import {normalizeQuestion,isTagalog,explainParts,productTerms} from './partTerms.js';
import { readCache, queueItems, projectedProducts } from './offline.js';

export async function answerLocally(message,userId,online,language='en',role='inventory_staff') {
 const fil=language==='fil'||isTagalog(message),definition=explainParts(message,fil);if(definition)return {answer:definition,mode:'local'};
 const q=normalizeQuestion(message).trim();
 if(fil&&/^(kumusta|kamusta|hi|hello|magandang umaga)[! .]*$/.test(q))return {answer:'Kumusta! Magtanong tungkol sa piyesa, dami ng stock, presyo, o pagdagdag ng stock.',mode:'local'};
 if(fil&&/paano/.test(q)&&/hanap|piyesa/.test(q))return {answer:'Buksan ang Mga piyesa.\n\n1. I-type ang pangalan, part number o barcode.\n2. Tingnan ang stock at kung saan nakalagay ang piyesa.\n\nPuwede ring mag-scan ng barcode.',mode:'local'};
 if(fil&&/walang internet|offline|sync/.test(q))return {answer:'Mag-sign in muna habang may internet. Magagamit ang na-save na stock nang hanggang 12 oras.\n\nPuwedeng mag-save ng benta o delivery kahit walang internet. Iwanang bukas ang PartCast kapag may internet na para ma-save online. Huwag munang mag-sign out kung may hindi pa na-save online.',mode:'local'};
 if(fil&&/paano/.test(q)&&/sales|sale|sell/.test(q))return {answer:'Buksan ang Magbenta o tumanggap.\n\n1. Piliin ang Magbenta ng mga piyesa.\n2. Pindutin ang mga piyesang bibilhin ng customer.\n3. I-check ang dami at presyo.\n4. Pindutin ang I-save ang benta.\n\nKung utang, piliin ang Magbabayad ang customer sa ibang araw at ilagay ang pangalan niya.',mode:'local'};
 if(fil&&/paano/.test(q)&&/receive|delivery|stock/.test(q))return {answer:'Buksan ang Magbenta o tumanggap.\n\n1. Piliin ang Tumanggap ng delivery.\n2. Piliin ang mga dumating na piyesa.\n3. Ilagay ang dami at halaga.\n4. Pindutin ang I-save ang delivery.',mode:'local'};
 if(fil&&/utang/.test(q)&&role==='cashier')return {answer:'Sa Magbenta o tumanggap, piliin ang Magbabayad ang customer sa ibang araw. Ilagay ang pangalan at kung magkano ang binayad niya. Tanungin ang may-ari para sa dating utang at mga hulog.',mode:'local'};
 if(fil&&/utang/.test(q))return {answer:'Buksan ang Utang ng customer.\n\n1. Hanapin ang pangalan ng customer.\n2. Piliin ang Ilagay ang bayad.\n3. Ilagay ang halaga at i-save.\n\nKailangan ng internet para ma-save ang bayad.',mode:'local'};
 if(/^(hi|hello|hey|good morning)[!. ]*$/.test(q))return {answer:'Hello! Ask me about a part, stock levels, prices or restocking. I can also explain how to record a sale.',mode:'local'};
 if(/how (do|can|to).*?(record|add).*sale/.test(q))return {answer:'Open Sell or receive and choose Sell parts.\n\n1. Tap each part the customer wants.\n2. Check the quantities and prices in your basket.\n3. Choose Confirm sale.\n\nWithout internet, the sale stays on this device and sends when you reconnect.',mode:'local'};
 if(/how (do|can|to).*?(receive|add).*?(delivery|stock)|how.*delivery/.test(q))return {answer:'Open Sell or receive and choose Receive delivery.\n\n1. Tap the parts that arrived.\n2. Enter the quantities and check the costs.\n3. Choose Confirm delivery.\n\nWithout internet, the delivery stays on this device and sends when you reconnect.',mode:'local'};
 if(/how (do|can|to).*?(find|search).*part/.test(q))return {answer:'Open Inventory (Parts on your phone).\n\n1. Type the part name, part number or brand in the search box.\n2. Check its stock, price and shelf location.',mode:'local'};
 if(/offline|no internet|sync/.test(q))return {answer:'After signing in online, your inventory is saved on this device for up to 12 hours. You can view saved parts and record sales or deliveries offline. Keep PartCast open after reconnecting so waiting changes send automatically. If stock has changed, review the waiting transaction. Do not sign out before your changes have been sent.',mode:'local'};
 if(/install|download.*app/.test(q))return {answer:'Use Install app when offered, or your browser menu → Install app / Add to Home Screen. On iPhone use Safari → Share → Add to Home Screen. Installation needs a secure HTTPS site and one online visit.',mode:'local'};
 if(online)return null;
 const snapshot=await readCache(userId,'/api/offline-snapshot');
 if(!snapshot)return {answer:fil?'Wala pang na-save na stock dito. Kumonekta sa internet at mag-sign in muna.':'No inventory is saved on this device yet. Connect and sign in once to prepare offline use.',mode:'local'};
 const rows=projectedProducts(snapshot.value.products,await queueItems(userId));
 const prefix=fil?`Naka-save na stock noong ${new Date(snapshot.savedAt).toLocaleString()}. Kasama ang hindi pa na-save online.\n\n`:`Saved inventory from ${new Date(snapshot.savedAt).toLocaleString()} (includes unsent stock changes).\n\n`;
 let matching;
 if(/out of stock|no stock/.test(q))matching=rows.filter(p=>p.current_stock<=0);
 else if(/low stock|restock|running low/.test(q))matching=rows.filter(p=>p.current_stock<=p.minimum_stock);
 else {
  const known=productTerms(message);
  const words=q.replace(/[^a-z0-9- ]/g,'').split(/\s+/).filter(w=>w.length>2&&!['what','which','where','have','stock','price','parts','part','much','cost','the','for','available','selling','ang','natin','quantity','ngayon','po','ba','you','we','are','can','there','any','tayo','kayo','kami','yung','ito','alin','para'].includes(w));
  if(!words.length)return {answer:fil?'Puwede kong tingnan ang na-save na stock at presyo. Kailangan ng internet para sa kabuuang benta at bagong estimate.':'Without internet, I can check saved parts, prices and low stock. Connect to check sales totals or new estimates.',mode:'local'};
  matching=rows.filter(p=>{const text=`${p.part_number} ${p.description} ${p.brand} ${p.barcode||''} ${(p.search_aliases||[]).join(' ')}`.toLowerCase();return known.length?known.some(w=>text.includes(w)):words.every(w=>text.includes(w));});
 }
 if(!matching.length)return {answer:prefix+(fil?'Walang mahanap na piyesa sa na-save na stock.':'No matching parts found in the saved inventory.'),mode:'local'};
 return {answer:prefix+matching.slice(0,6).map(p=>`- ${p.description}\n  ${p.part_number|| (fil?'Walang part number':'No part number')}\n  Stock: **${p.current_stock} ${p.unit||'units'}**${/price|how much/.test(q)?`\n  ${fil?'Presyo':'Price'}: ₱${Number(p.selling_price).toFixed(2)}`:''}`).join('\n')+(matching.length>6?`\n\n${fil?`May ${matching.length} piyesang tugma sa tanong mo.`:`${matching.length} parts match in total.`}`:''),mode:'local'};
}
