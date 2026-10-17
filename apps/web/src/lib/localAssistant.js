import {normalizeQuestion,isTagalog,explainParts,productTerms} from './partTerms.js';
import { readCache, queueItems, projectedProducts } from './offline.js';

export async function answerLocally(message,userId,online,language='en',role='inventory_staff') {
 const fil=language==='fil'||isTagalog(message),definition=explainParts(message,fil);if(definition)return {answer:definition,mode:'local'};
 const q=normalizeQuestion(message).trim();
 if(fil&&/^(kumusta|kamusta|hi|hello|magandang umaga)[! .]*$/.test(q))return {answer:'Kumusta! Magtanong tungkol sa piyesa, dami ng stock, presyo, o pagdagdag ng stock.',mode:'local'};
 if(fil&&/paano/.test(q)&&/hanap|piyesa/.test(q))return {answer:'Buksan ang Imbentaryo at ilagay ang pangalan, part number, o barcode sa paghahanap. Maaari ring mag-scan ng barcode. Makikita ang dami at lokasyon ng bawat piyesa.',mode:'local'};
 if(fil&&/walang internet|offline|sync/.test(q))return {answer:'Mag-sign in muna habang may internet para ma-save ang imbentaryo. Hanggang 12 oras ang offline access. Maaaring magtala ng benta o delivery; panatilihing bukas ang PartCast kapag may internet na para maipadala ang mga pagbabago. Huwag mag-sign out habang may hindi pa naipapadalang tala.',mode:'local'};
 if(fil&&/paano/.test(q)&&/sales|sale|sell/.test(q))return {answer:'Buksan ang Sell or receive, piliin ang mga piyesa, ilagay ang dami at presyo, at piliin ang Confirm sale. Para sa utang, piliin ang Customer will pay later at ilagay ang pangalan ng customer. Naka-save sa device ang offline sales at awtomatikong ipapadala kapag may internet.',mode:'local'};
 if(fil&&/paano/.test(q)&&/receive|delivery|stock/.test(q))return {answer:'Buksan ang Sell or receive at piliin ang Receive delivery. Piliin ang mga dumating na piyesa, ilagay ang dami at halaga, at piliin ang Confirm delivery.',mode:'local'};
 if(fil&&/utang/.test(q)&&role==='cashier')return {answer:'Sa Magbenta o tumanggap, piliin ang Customer will pay later at ilagay ang pangalan ng customer at halagang binayaran. Hilingin sa may-ari ang detalye ng utang at pagtatala ng hulog.',mode:'local'};
 if(fil&&/utang/.test(q))return {answer:'Buksan ang Customer utang para makita ang mga balanse at due date. Piliin ang Record payment para sa hulog o buong bayad. Kailangan ng internet para sa bayad; puwedeng magtala ng bagong credit sale offline sa Sell or receive.',mode:'local'};
 if(/^(hi|hello|hey|good morning)[!. ]*$/.test(q))return {answer:'Hello! Ask me about a part, stock levels, prices or restocking. I can also explain how to record a sale.',mode:'local'};
 if(/how (do|can|to).*?(record|add).*sale/.test(q))return {answer:'Open Sell or receive, choose Sell parts, and tap each part to add it to your basket. Check quantities and prices, then choose Confirm sale. Offline sales are saved on this device and sent automatically when connected.',mode:'local'};
 if(/how (do|can|to).*?(receive|add).*?(delivery|stock)|how.*delivery/.test(q))return {answer:'Open Sell or receive and choose Receive delivery. Add each part to the basket and enter the quantity that arrived. Check the costs and supplier, then choose Confirm delivery. Offline deliveries send automatically when connected.',mode:'local'};
 if(/how (do|can|to).*?(find|search).*part/.test(q))return {answer:'Open Inventory (Parts on your phone) and enter the part name, part number or brand in its search box. Each result shows how many are available and where to find them.',mode:'local'};
 if(/offline|no internet|sync/.test(q))return {answer:'After signing in online, your inventory is saved on this device for up to 12 hours. You can view saved parts and record sales or deliveries offline. Keep PartCast open after reconnecting so waiting changes send automatically. If stock has changed, review the waiting transaction. Do not sign out before your changes have been sent.',mode:'local'};
 if(/install|download.*app/.test(q))return {answer:'Use Install app when offered, or your browser menu → Install app / Add to Home Screen. On iPhone use Safari → Share → Add to Home Screen. Installation needs a secure HTTPS site and one online visit.',mode:'local'};
 if(online)return null; // Live database facts take precedence whenever connected.
 const snapshot=await readCache(userId,'/api/offline-snapshot');
 if(!snapshot)return {answer:fil?'Walang naka-save na imbentaryo sa device. Kumonekta at mag-sign in muna para maihanda ang offline na paggamit.':'No inventory is saved on this device yet. Connect and sign in once to prepare offline use.',mode:'local'};
 const rows=projectedProducts(snapshot.value.products,await queueItems(userId));
 const prefix=fil?`Naka-save na imbentaryo noong ${new Date(snapshot.savedAt).toLocaleString()} (kasama ang hindi pa naipapadalang pagbabago). `:`Saved inventory from ${new Date(snapshot.savedAt).toLocaleString()} (includes unsent stock changes). `;
 let matching;
 if(/out of stock|no stock/.test(q))matching=rows.filter(p=>p.current_stock<=0);
 else if(/low stock|restock|running low/.test(q))matching=rows.filter(p=>p.current_stock<=p.minimum_stock);
 else {
  const known=productTerms(message);
  const words=q.replace(/[^a-z0-9- ]/g,'').split(/\s+/).filter(w=>w.length>2&&!['what','which','where','have','stock','price','parts','part','much','cost','the','for','available','selling','ang','natin','quantity','ngayon','po','ba','you','we','are','can','there','any','tayo','kayo','kami','yung','ito','alin','para'].includes(w));
  if(!words.length)return {answer:fil?'Maaari kong tingnan ang naka-save na imbentaryo, presyo, at paubos na stock. Kailangan ng internet para sa buod ng benta at bagong pagtataya.':'Offline, I can check saved inventory, prices and low stock. Sales summaries and new demand estimates need internet.',mode:'local'};
  matching=rows.filter(p=>{const text=`${p.part_number} ${p.description} ${p.brand} ${p.barcode||''} ${(p.search_aliases||[]).join(' ')}`.toLowerCase();return known.length?known.some(w=>text.includes(w)):words.every(w=>text.includes(w));});
 }
 if(!matching.length)return {answer:prefix+(fil?'Walang katugmang piyesa sa naka-save na imbentaryo.':'No matching parts found in the saved inventory.'),mode:'local'};
 return {answer:prefix+matching.slice(0,6).map(p=>`${p.part_number||'No part number'} · ${p.description}: ${p.current_stock} ${p.unit||'units'}${/price|how much/.test(q)?`, ₱${Number(p.selling_price).toFixed(2)} each`:''}`).join('; ')+(matching.length>6?` (${matching.length} matching parts in total).`:'.'),mode:'local'};
}
