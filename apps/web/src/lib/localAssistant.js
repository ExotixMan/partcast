import { readCache, queueItems, projectedProducts } from './offline.js';

export async function answerLocally(message,userId,online) {
 const q=message.toLowerCase().trim();
 if(/^(hi|hello|hey|good morning)[!. ]*$/.test(q))return {answer:'Hello! Ask me about a part, stock levels, prices or restocking. I can also explain how to record a sale.',mode:'local'};
 if(/how (do|can|to).*?(record|add).*sale/.test(q))return {answer:'Open Inventory, find the part and choose Sell (the cart button on desktop). Enter the quantity, then record the transaction. Offline sales are saved here and sent automatically when connected.',mode:'local'};
 if(/offline|no internet|sync/.test(q))return {answer:'After signing in online, your inventory is saved on this device for up to 12 hours. You can view saved parts and record stock movements offline. Reconnect to send them automatically. If stock has changed, review the waiting transaction. Keep this device protected and do not sign out before syncing.',mode:'local'};
 if(/install|download.*app/.test(q))return {answer:'Use Install app when offered, or your browser menu → Install app / Add to Home Screen. On iPhone use Safari → Share → Add to Home Screen. Installation needs a secure HTTPS site and one online visit.',mode:'local'};
 if(online)return null; // Live database facts take precedence whenever connected.
 const snapshot=await readCache(userId,'/api/offline-snapshot');
 if(!snapshot)return {answer:'No inventory is saved on this device yet. Connect and sign in once to prepare offline use.',mode:'local'};
 const rows=projectedProducts(snapshot.value.products,await queueItems(userId));
 const prefix=`Saved inventory from ${new Date(snapshot.savedAt).toLocaleString()} (includes unsent stock changes). `;
 let matching;
 if(/out of stock|no stock/.test(q))matching=rows.filter(p=>p.current_stock<=0);
 else if(/low stock|restock|running low/.test(q))matching=rows.filter(p=>p.current_stock<=p.minimum_stock);
 else {
  const words=q.replace(/[^a-z0-9- ]/g,'').split(/\s+/).filter(w=>w.length>2&&!['what','which','where','have','stock','price','parts','part','much','cost','the','for','available','selling'].includes(w));
  if(!words.length)return {answer:'Offline, I can check saved inventory, prices and low stock. Sales summaries and new demand estimates need internet.',mode:'local'};
  matching=rows.filter(p=>words.every(w=>`${p.part_number} ${p.description} ${p.brand}`.toLowerCase().includes(w)));
 }
 if(!matching.length)return {answer:prefix+'No matching parts found in the saved inventory.',mode:'local'};
 return {answer:prefix+matching.slice(0,6).map(p=>`${p.part_number||'No part number'} · ${p.description}: ${p.current_stock} ${p.unit||'units'}${/price|how much/.test(q)?`, ₱${Number(p.selling_price).toFixed(2)} each`:''}`).join('; ')+(matching.length>6?` (${matching.length} matching parts in total).`:'.'),mode:'local'};
}
