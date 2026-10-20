import {getIntegration,integrationReady} from '../utils/integrations.js';
import {normalizeQuestion,isTagalog,explainParts,productTerms} from '../utils/partTerms.js';
import { adminDb } from '../supabase.js';
import {neededRestock,normalizeRestock} from '../utils/restock.js';
import {partReply,replyList,partUnit} from '../utils/assistantReplies.js';
import {literalSearchFilter} from '../utils/search.js';

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function compactText(value, max = 240) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function money(value) {
  return `₱${safeNumber(value).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function units(value) {
  return safeNumber(value).toLocaleString('en-PH', {
    maximumFractionDigits: 2
  });
}

function extractSearchTerm(message) {
  const candidates =
    String(message || '').match(/[A-Za-z0-9][A-Za-z0-9_\-./()]{2,}/g) || [];

  const stopWords = new Set([
    'what', 'which', 'where', 'when', 'who', 'whose', 'why', 'how',
    'many', 'much', 'stock', 'stocks', 'inventory', 'sale', 'sales',
    'sold', 'selling', 'price', 'prices', 'cost', 'available', 'availability',
    'part', 'parts', 'product', 'products', 'item', 'items', 'show', 'give',
    'please', 'need', 'needs', 'needed', 'have', 'does', 'with', 'from',
    'this', 'that', 'today', 'week', 'month', 'year', 'units', 'unit',
    'reorder', 'restock', 'restocking', 'supplier', 'suppliers', 'demand',
    'expected', 'forecast', 'prediction', 'fast', 'slow', 'moving', 'best',
    'top', 'current', 'store', 'shop', 'npg','the','are','can','our','quantity','po','ba','ang','ng','natin','ngayon','you','we','are','can','there','any','tayo','kayo','kami','yung','ito','alin','para'
  ]);

  return (
    candidates
      .map(value => value.trim())
      .find(value => !stopWords.has(value.toLowerCase())) || ''
  );
}

function sanitizeSearchTerm(term) {
  return String(term || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, 80);
}

function summarizeSales(rows) {
  const data = Array.isArray(rows) ? rows : [];

  function sumLast(days) {
    const selected = data.slice(-Math.max(1, days));

    return selected.reduce(
      (total, row) => ({
        quantity: total.quantity + safeNumber(row.quantity),
        revenue: total.revenue + safeNumber(row.revenue)
      }),
      { quantity: 0, revenue: 0 }
    );
  }

  return {
    today: sumLast(1),
    last7Days: sumLast(7),
    last30Days: sumLast(30)
  };
}

async function loadContext(message) {
  const searchTerm = productTerms(message)[0]||extractSearchTerm(normalizeQuestion(message));
  const safeTerm = sanitizeSearchTerm(searchTerm);
  const terms=(productTerms(message).length?productTerms(message):[safeTerm]).map(sanitizeSearchTerm).filter(Boolean);
  const searchFilter=literalSearchFilter(['part_number','description','brand','barcode','alias_text'],terms);

  const defaultProducts = adminDb
    .from('inventory_status')
    .select(
      'id,part_number,description,brand,current_stock,minimum_stock,safety_stock,unit,location,selling_price,unit_cost,stock_status'
    )
    .eq('active', true)
    .order('current_stock', { ascending: true })
    .limit(8);

  const productSearch = safeTerm
    ? adminDb
        .from('inventory_status')
        .select(
          'id,part_number,description,brand,current_stock,minimum_stock,safety_stock,unit,location,selling_price,unit_cost,stock_status'
        )
        .eq('active', true)
        .or(
          searchFilter
        )
        .limit(8)
    : defaultProducts;

  const matchingDemand = safeTerm
    ? adminDb
        .from('reorder_recommendations')
        .select(
          'product_id,part_number,description,current_stock,minimum_stock,safety_stock,predicted_quantity,recommended_quantity,unit,supplier_name,estimated_unit_cost,estimated_order_cost,status'
        )
        .or(
          literalSearchFilter(['part_number','description'],[safeTerm])
        )
        .limit(8)
    : Promise.resolve({ data: [], error: null });

  const [
    metrics,
    lowStock,
    reorders,
    latestEstimate,
    products,
    productDemand,
    salesTrend,
    fastMoving,
    slowMoving,
    demandLeaders
  ] = await Promise.all([
    adminDb.rpc('get_dashboard_metrics'),

    adminDb
      .from('inventory_status')
      .select(
        'part_number,description,current_stock,minimum_stock,unit,stock_status'
      )
      .eq('active', true)
      .in('stock_status', ['low', 'out'])
      .order('current_stock', { ascending: true })
      .limit(12),

    neededRestock(adminDb
      .from('reorder_recommendations')
      .select(
        'product_id,part_number,description,current_stock,predicted_quantity,recommended_quantity,unit,supplier_name,estimated_unit_cost,estimated_order_cost,status'
      ))
      .order('recommended_quantity', { ascending: false })
      .limit(10),

    adminDb
      .from('latest_completed_forecast_run')
      .select('completed_at,horizon_days')
      .maybeSingle(),

    productSearch,
    matchingDemand,

    adminDb.rpc('get_sales_trend', { p_days: 30 }),

    adminDb.rpc('get_top_moving_products', {
      p_days: 90,
      p_limit: 8,
      p_direction: 'desc'
    }),

    adminDb.rpc('get_top_moving_products', {
      p_days: 90,
      p_limit: 8,
      p_direction: 'asc'
    }),

    adminDb
      .from('reorder_recommendations')
      .select(
        'product_id,part_number,description,current_stock,predicted_quantity,recommended_quantity,unit,estimated_unit_cost,status'
      )
      .gt('predicted_quantity', 0)
      .order('predicted_quantity', { ascending: false })
      .limit(8)
  ]);

  for (const result of [
    metrics,
    lowStock,
    reorders,
    latestEstimate,
    products,
    productDemand,
    salesTrend,
    fastMoving,
    slowMoving,
    demandLeaders
  ]) {
    if (result?.error) {
      throw result.error;
    }
  }

  return {
    searchTerm,
    metrics: metrics.data || {},
    lowStock: lowStock.data || [],
    reorders: (reorders.data || []).map(normalizeRestock),
    matchingProducts: products.data || [],
    matchingDemand: (productDemand.data || []).map(normalizeRestock),
    sales: summarizeSales(salesTrend.data || []),
    fastMoving: fastMoving.data || [],
    slowMoving: slowMoving.data || [],
    demandLeaders: (demandLeaders.data || []).map(normalizeRestock),
    demandEstimate: latestEstimate.data
      ? {
          available: true,
          updatedAt: latestEstimate.data.completed_at,
          horizonDays: safeNumber(latestEstimate.data.horizon_days)
        }
      : {
          available: false,
          updatedAt: null,
          horizonDays: 0
        }
  };
}

function technicalQuestion(question) {
  return /\b(api|database|supabase|machine learning|algorithm|model metrics?|training data|dataset|backend|frontend|server|code|coding|developer|deployment|render|github|system status)\b/i.test(
    question
  );
}

export function localAnswer(message, context) {
  const question = String(message || '').toLowerCase();
  const metrics = context.metrics || {};
  const stockLine = item => `In stock: ${units(item.current_stock)} ${partUnit(item)}`;
  if (technicalQuestion(question) && !/forecast|demand|xgboost/.test(question)) {
    return 'Ask me about stock, prices, sales or what to order next.';
  }
  if (/out of stock|out-of-stock|unavailable|no stock/.test(question)) {
    const rows = context.lowStock.filter(item => item.stock_status === 'out').slice(0, 6);
    if (!rows.length) return `Out-of-stock parts: ${units(metrics.outOfStock)}.`;
    return replyList('These parts are out of stock:', rows.map(item => partReply(item)));
  }
  if (/low stock|running low|nearly out|almost out/.test(question)) {
    const rows = context.lowStock.filter(item => item.stock_status === 'low').slice(0, 6);
    if (!rows.length) return `Parts running low: ${units(metrics.lowStock)}.`;
    return replyList('These parts are running low:', rows.map(item => partReply(item, [stockLine(item)])));
  }
  if (/restock|reorder|replenish|order more|need to order/.test(question)) {
    if (!context.reorders.length) return 'No parts need restocking based on the saved stock and sales estimates.';
    return replyList('Check these parts for your next order:', context.reorders.slice(0, 6).map(item => partReply(item, [
      `Order: **${units(item.recommended_quantity)} ${partUnit(item)}**`,
      item.supplier_name ? `Supplier: ${item.supplier_name}` : null
    ])), 'Buy 1–2 units per part at a time. Check your shelves and delivery time before ordering again.');
  }
  if (/best sell|best-selling|best selling|fast moving|fast-moving|top selling|most sold/.test(question)) {
    const rows = context.fastMoving.filter(item => safeNumber(item.quantity) > 0).slice(0, 6);
    if (!rows.length) return 'There are not enough saved sales to show your best-selling parts yet.';
    return replyList('These parts sold the most recently:', rows.map(item => partReply(item, [`Sold: **${units(item.quantity)}**`])));
  }
  if (/slow moving|slow-moving|not selling|least sold|slow seller/.test(question)) {
    const rows = context.slowMoving.slice(0, 6);
    if (!rows.length) return 'There are not enough saved sales to show slow-selling parts yet.';
    return replyList('These parts have fewer recent sales:', rows.map(item => partReply(item, [`Sold: **${units(item.quantity)}**`])));
  }
  if (/sales today|today.*sales/.test(question)) return `Today's saved sales: **${money(context.sales.today.revenue)}**.\n\nQuantity sold: ${units(context.sales.today.quantity)} units.`;
  if (/sales.*week|week.*sales|last 7 days|past 7 days/.test(question)) return `Saved sales in the last 7 days: **${money(context.sales.last7Days.revenue)}**.\n\nQuantity sold: ${units(context.sales.last7Days.quantity)} units.`;
  if (/sales|revenue|income/.test(question)) return `Saved sales in the last 30 days: **${money(context.sales.last30Days.revenue)}**.\n\nQuantity sold: ${units(context.sales.last30Days.quantity)} units.`;
  if (/expected demand|demand|forecast|prediction|predict|likely to sell|may sell/.test(question)) {
    if (!context.demandEstimate.available) return 'A sales estimate is not ready yet. Open Demand planning to check it.';
    if (context.searchTerm && context.matchingDemand.length) {
      const item = context.matchingDemand[0];
      return replyList(`Expected sales over ${context.demandEstimate.horizonDays} days:`, [partReply(item, [
        `May sell: **${units(item.predicted_quantity)} ${partUnit(item)}**`, stockLine(item),
        safeNumber(item.recommended_quantity) > 0 ? `Next purchase: **${units(item.recommended_quantity)} ${partUnit(item)}**` : 'No extra stock is suggested now.'
      ])], 'This is an estimate. Your next purchase stays at 1–2 units per part.');
    }
    if (!context.demandLeaders.length) return 'There are no positive sales estimates for this period yet.';
    return replyList(`Parts that may sell over ${context.demandEstimate.horizonDays} days:`, context.demandLeaders.slice(0, 6).map(item => partReply(item, [`May sell: **${units(item.predicted_quantity)} ${partUnit(item)}**`])), 'These are sales estimates for the full period, not quantities to order now.');
  }
  if (/supplier|where.*order|who.*supply/.test(question) && context.searchTerm) {
    const item = context.matchingDemand[0];
    if (!item) return `No matching part found for “${context.searchTerm}”. Try its part number.`;
    return replyList('Supplier details:', [partReply(item, [item.supplier_name ? `Supplier: ${item.supplier_name}` : 'No supplier is saved for this part yet.'])]);
  }
  if (/inventory value|stock value|value of inventory/.test(question)) return `Stock at purchase cost: **${money(metrics.inventoryValue)}**.\n\nStock at selling price: ${money(metrics.retailValue)}.`;
  if (/how many products|number of products|total products|inventory count/.test(question)) return `Parts in inventory: **${units(metrics.totalProducts)}**.\n\n- Running low: ${units(metrics.lowStock)}\n- Out of stock: ${units(metrics.outOfStock)}`;
  if (context.searchTerm && /stock|available|price|cost|where|location|part|have|sell/.test(question)) {
    if (!context.matchingProducts.length) return `No matching part found for “${context.searchTerm}”. Try the part number or brand.`;
    return replyList(context.matchingProducts.length > 1 ? 'Choose the part number that matches your customer’s vehicle:' : 'Here is the saved part:', context.matchingProducts.slice(0, 6).map(item => partReply(item, [
      stockLine(item),
      /price|selling price|how much/.test(question) ? `Price: **${money(item.selling_price)}** per ${partUnit(item)}` : null,
      /cost|purchase cost|unit cost/.test(question) ? `Purchase cost: ${money(item.unit_cost)}` : null,
      /where|location|located/.test(question) ? `Location: ${item.location || 'Not saved yet'}` : null
    ])));
  }
  return null;
}

async function geminiAnswer(message, context, language) {
  const integration=await getIntegration('gemini');
  const prompt = `You are the NPG Autoparts Store Assistant speaking directly to the store owner.

The owner may be older and unfamiliar with computers. Use short, direct sentences. Put each part on its own bullet, with its exact part number and quantity on separate lines. Use no more than 6 parts. For instructions use up to 4 numbered steps. Keep the whole answer around 120 words when possible. Use blank lines between ideas; never pack a list into a paragraph separated by semicolons. No tables, links, HTML or markdown headings. You may bold a quantity or price.

You may ONLY answer questions about store operations, including:
- current inventory and stock availability
- low-stock and out-of-stock items
- product prices and recorded costs
- sales and revenue
- fast-selling and slow-moving parts
- suppliers
- restocking and reorder needs
- inventory value
- expected future demand for parts

Never discuss or mention software implementation, APIs, databases, Supabase, servers, code, deployment, XGBoost, machine learning, algorithms, training data, datasets, model metrics, or technical system status.

If the user asks a technical question, politely say you can help with store operations and suggest a store-related question instead.

When discussing future demand, call it "expected demand", "demand estimate", or "expected sales demand". Do not explain how the estimate was calculated.

Use ONLY the supplied store context. Never invent quantities, prices, sales, suppliers, or demand. If information is unavailable, say that the store records do not currently show enough information.

The owner purchases only 1–2 units per part at a time. Suggested order quantities in the context are for that next purchase. Expected demand covers the full planning period and can be higher; it can require several small purchases. Never turn the full-period demand estimate into a larger suggested single order. Ask the owner to review sales, stock and supplier delivery time before ordering again.

Do not reveal customer names, supplier email addresses, credentials, secrets, or private technical information.

Reply in ${language==='fil'?'everyday conversational Tagalog or Taglish, as used in an auto parts store':'plain English'}. In Tagalog, keep familiar words such as stock, order, supplier, delivery, price and part number. Say puwede, benta and piraso. Avoid formal words such as yunit, pagtataya, pangangailangan, imbentaryo and kasalukuyang panahon ng pagpaplano. Distinguish coolant fluid from the radiator component; do not treat related parts as interchangeable.

STORE CONTEXT:
${JSON.stringify(context)}

OWNER QUESTION:
${compactText(message, 1000)}`;

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      integration.model
    )}:generateContent`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'x-goog-api-key': integration.api_key
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 450
      }
    }),
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(
      `Assistant request failed (${response.status}).`
    );
  }

  const body = await response.json();

  const text = body?.candidates?.[0]?.content?.parts
    ?.map(part => part.text || '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('Assistant returned an empty response.');
  }

  return compactText(text, 2000);
}

export async function assistantMode() {
  const integration=await getIntegration('gemini');
  return integrationReady('gemini',integration)
    ? {
        mode: 'gemini',
        model: integration.model
      }
    : {
        mode: 'smart-local',
        model: null
      };
}

export function tagalogStoreAnswer(message,context){
 const q=normalizeQuestion(message), stockLine=p=>`Stock: ${units(p.current_stock)} ${partUnit(p,true)}`;
 if(/out of stock/.test(q)){
  const rows=context.lowStock.filter(p=>p.stock_status==='out');
  return rows.length?replyList('Ubos na ang stock ng mga ito:',rows.slice(0,6).map(p=>partReply(p))):`Ubos na piyesa: ${units(context.metrics?.outOfStock)}.`;
 }
 if(/low stock/.test(q)){
  const rows=context.lowStock.filter(p=>p.stock_status==='low');
  return rows.length?replyList('Paubos na ang mga ito:',rows.slice(0,6).map(p=>partReply(p,[stockLine(p)]))):`Paubos na piyesa: ${units(context.metrics?.lowStock)}.`;
 }
 if(/restock/.test(q))return context.reorders.length?replyList('Ito ang puwedeng orderin:',context.reorders.slice(0,6).map(p=>partReply(p,[
  `Order: **${units(p.recommended_quantity)} ${partUnit(p,true)}**`,p.supplier_name?`Supplier: ${p.supplier_name}`:null
 ])),'1–2 lang bawat piyesa sa isang order. Tingnan muna ang stock at oras ng delivery bago umorder ulit.'):'Wala pang kailangang orderin base sa stock at estimate ng benta.';
 if(/fast moving|best.sell|most sold|top selling|slow moving|not selling/.test(q)){
  const slow=/slow moving|not selling/.test(q),rows=(slow?context.slowMoving:context.fastMoving).filter(p=>slow||safeNumber(p.quantity)>0);
  return rows.length?replyList(slow?'Mas kaunti ang benta ng mga ito:':'Ito ang mga mabenta:',rows.slice(0,6).map(p=>partReply(p,[`Nabenta: **${units(p.quantity)}**`]))):'Kulang pa ang na-save na benta para masabi ito.';
 }
 if(/sales/.test(q)){
  const data=/today/.test(q)?context.sales.today:/week/.test(q)?context.sales.last7Days:context.sales.last30Days;
  return `Na-save na benta ${/today/.test(q)?'ngayon':/week/.test(q)?'sa huling 7 araw':'sa huling 30 araw'}: **${money(data.revenue)}**.\n\nDami ng nabenta: ${units(data.quantity)} unit.`;
 }
 if(/demand|forecast|prediction/.test(q)){
  if(!context.demandEstimate.available)return 'Wala pang estimate ng benta. Tingnan ang Plano ng stock para ma-check ito.';
  const rows=context.searchTerm?context.matchingDemand:context.demandLeaders;
  return rows.length?replyList(`Posibleng mabenta sa ${context.demandEstimate.horizonDays} araw:`,rows.slice(0,6).map(p=>partReply(p,[
   `Puwedeng mabenta: **${units(p.predicted_quantity)} ${partUnit(p,true)}**`,
   context.searchTerm?stockLine(p):null,
   context.searchTerm?`Susunod na order: ${units(p.recommended_quantity)} ${partUnit(p,true)}`:null
  ])),'Estimate lang ito. Iba ang posibleng benta sa dami ng bibilhin ngayon.'):'Wala pang estimate para sa piyesang ito.';
 }
 if(context.searchTerm){
  return context.matchingProducts.length?replyList('Ito ang nakita sa mga record:',context.matchingProducts.slice(0,6).map(p=>partReply(p,[stockLine(p),/price/.test(q)?`Presyo: **${money(p.selling_price)}** bawat ${partUnit(p,true)}`:null,/where/.test(q)?`Nakalagay sa: ${p.location||'Wala pang nakalagay na lokasyon'}`:null]))):'Walang mahanap na piyesa. Subukan ang part number o brand.';
 }
 return null;
}

async function cashierAnswer(message,fil){
 const q=normalizeQuestion(message);
 if(/cost|capital|profit|revenue|sales|benta|forecast|demand|supplier|utang/.test(q))return {answer:fil?'Para sa ulat ng benta, utang, o pagpaplano, tanungin ang may-ari. Makakatulong ako sa paghahanap, presyo at stock ng piyesa.':'Ask the owner about sales reports, customer balances or planning. I can help find parts, selling prices and stock.',mode:'database',model:null};
 const terms=productTerms(message),term=terms[0]||extractSearchTerm(q);
 let query=adminDb.from('inventory_status').select('part_number,description,current_stock,unit,location,selling_price,stock_status').eq('active',true);
 if(/out of stock/.test(q))query=query.eq('stock_status','out');else if(/low stock/.test(q))query=query.eq('stock_status','low');
 else if(term)query=query.or(literalSearchFilter(['description','part_number','barcode','alias_text'],(terms.length?terms:[term]).map(sanitizeSearchTerm).filter(Boolean)));
 const {data,error}=await query.order('description').limit(8);if(error)throw error;
 return {answer:data.length?replyList(fil?'Ito ang nakita sa mga record:':'Here are the saved parts:',data.map(p=>partReply(p,[`Stock: ${units(p.current_stock)} ${partUnit(p,fil)}`,/price/.test(q)?`${fil?'Presyo':'Price'}: **${money(p.selling_price)}**`:null,/where/.test(q)?`${fil?'Nakalagay sa':'Location'}: ${p.location||(fil?'Wala pang nakalagay':'Not saved yet')}`:null]))):(fil?'Walang mahanap na piyesa.':'No matching parts.'),mode:'database',model:null};
}
export async function answerAssistant(message,language,role) {
 const fil=language==='fil'||isTagalog(message),definition=explainParts(message,fil);
 if(definition)return {answer:definition,mode:'local',model:null};
 if(role==='cashier')return cashierAnswer(message,fil);
 const context=await loadContext(message);
 const answer=fil?tagalogStoreAnswer(message,context):localAnswer(normalizeQuestion(message),context);
 if(answer)return {answer,mode:'database',model:null,updatedAt:new Date().toISOString()};
 const integration=await getIntegration('gemini');
 if(integrationReady('gemini',integration)){try{return {answer:await geminiAnswer(message.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email removed]'),context,fil?'fil':'en'),mode:'gemini',model:integration.model};}catch{console.error('Assistant AI unavailable; using store guidance.');}}
 return {answer:fil?'Puwede kitang tulungan sa stock, presyo at benta. Subukan ang part number o itanong: “Ano ang dapat orderin?”':'I can check stock, prices, sales, suppliers and expected demand. Try a part number or ask “Which parts need restocking?”',mode:'database',model:null};
}
