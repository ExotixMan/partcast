import { adminDb } from '../supabase.js';
import { config } from '../config.js';

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
    'top', 'current', 'store', 'shop', 'npg'
  ]);

  return (
    candidates
      .map(value => value.trim())
      .find(value => !stopWords.has(value.toLowerCase())) || ''
  );
}

function sanitizeSearchTerm(term) {
  return String(term || '')
    .replace(/[^A-Za-z0-9_\-./ ()]/g, '')
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
  const searchTerm = extractSearchTerm(message);
  const safeTerm = sanitizeSearchTerm(searchTerm);

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
          `part_number.ilike.%${safeTerm}%,description.ilike.%${safeTerm}%,brand.ilike.%${safeTerm}%`
        )
        .limit(8)
    : defaultProducts;

  const matchingDemand = safeTerm
    ? adminDb
        .from('reorder_recommendations')
        .select(
          'product_id,part_number,description,current_stock,minimum_stock,safety_stock,predicted_quantity,recommended_quantity,supplier_name,estimated_order_cost,status'
        )
        .or(
          `part_number.ilike.%${safeTerm}%,description.ilike.%${safeTerm}%`
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

    adminDb
      .from('reorder_recommendations')
      .select(
        'product_id,part_number,description,current_stock,predicted_quantity,recommended_quantity,supplier_name,estimated_order_cost,status'
      )
      .gt('recommended_quantity', 0)
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
        'product_id,part_number,description,current_stock,predicted_quantity,recommended_quantity,status'
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
    reorders: reorders.data || [],
    matchingProducts: products.data || [],
    matchingDemand: productDemand.data || [],
    sales: summarizeSales(salesTrend.data || []),
    fastMoving: fastMoving.data || [],
    slowMoving: slowMoving.data || [],
    demandLeaders: demandLeaders.data || [],
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
  return /\b(api|database|supabase|xgboost|machine learning|algorithm|model metrics?|training data|dataset|backend|frontend|server|code|coding|developer|deployment|render|github|system status)\b/i.test(
    question
  );
}

function localAnswer(message, context) {
  const question = String(message || '').toLowerCase();
  const metrics = context.metrics || {};

  if (technicalQuestion(question)) {
    return 'I can help you with store information instead. You can ask me about available stock, out-of-stock items, sales, best-selling or slow-moving parts, prices, suppliers, restocking, inventory value, or expected demand.';
  }

  if (/out of stock|out-of-stock|unavailable|no stock/.test(question)) {
    const rows = context.lowStock
      .filter(item => item.stock_status === 'out')
      .slice(0, 6);

    if (!rows.length) {
      return `You currently have ${safeNumber(metrics.outOfStock).toLocaleString()} out-of-stock item(s).`;
    }

    return `You currently have ${safeNumber(metrics.outOfStock).toLocaleString()} out-of-stock item(s). Some of them are: ${rows
      .map(item => `${item.part_number || 'No part number'} – ${item.description}`)
      .join('; ')}.`;
  }

  if (/low stock|running low|nearly out|almost out/.test(question)) {
    const rows = context.lowStock
      .filter(item => item.stock_status === 'low')
      .slice(0, 6);

    if (!rows.length) {
      return `There are currently ${safeNumber(metrics.lowStock).toLocaleString()} low-stock item(s).`;
    }

    return `There are ${safeNumber(metrics.lowStock).toLocaleString()} low-stock item(s). Priority items include: ${rows
      .map(
        item =>
          `${item.part_number || 'No part number'} – ${item.description} (${units(
            item.current_stock
          )} ${item.unit || 'unit(s)'} left)`
      )
      .join('; ')}.`;
  }

  if (/restock|reorder|replenish|order more|need to order/.test(question)) {
    if (!context.reorders.length) {
      return 'Nothing is currently flagged as needing restocking based on the store records available to me.';
    }

    return `The top items to consider restocking are: ${context.reorders
      .slice(0, 6)
      .map(item => {
        const supplier = item.supplier_name
          ? ` from ${item.supplier_name}`
          : '';

        return `${item.part_number || 'No part number'} – ${item.description}: about ${Math.ceil(
          safeNumber(item.recommended_quantity)
        )} unit(s)${supplier}`;
      })
      .join('; ')}.`;
  }

  if (/best sell|best-selling|best selling|fast moving|fast-moving|top selling|most sold/.test(question)) {
    const rows = context.fastMoving.filter(item => safeNumber(item.quantity) > 0);

    if (!rows.length) {
      return 'I do not see enough recent item-level sales yet to identify the best-selling parts.';
    }

    return `Your fastest-moving parts from recent recorded sales are: ${rows
      .slice(0, 6)
      .map(
        item =>
          `${item.part_number || 'No part number'} – ${item.description} (${units(
            item.quantity
          )} sold)`
      )
      .join('; ')}.`;
  }

  if (/slow moving|slow-moving|not selling|least sold|slow seller/.test(question)) {
    const rows = context.slowMoving.slice(0, 6);

    if (!rows.length) {
      return 'I do not see enough recent sales information to identify slow-moving parts yet.';
    }

    return `Some of the slow-moving parts are: ${rows
      .map(
        item =>
          `${item.part_number || 'No part number'} – ${item.description} (${units(
            item.quantity
          )} sold recently)`
      )
      .join('; ')}.`;
  }

  if (/sales today|today.*sales/.test(question)) {
    return `Today's recorded sales are ${money(context.sales.today.revenue)} from ${units(
      context.sales.today.quantity
    )} unit(s) sold.`;
  }

  if (/sales.*week|week.*sales|last 7 days|past 7 days/.test(question)) {
    return `For the last 7 days, recorded sales are ${money(
      context.sales.last7Days.revenue
    )} from ${units(context.sales.last7Days.quantity)} unit(s) sold.`;
  }

  if (/sales|revenue|income/.test(question)) {
    return `For the last 30 days, recorded sales are ${money(
      context.sales.last30Days.revenue
    )} from ${units(context.sales.last30Days.quantity)} unit(s) sold.`;
  }

  if (/expected demand|demand|forecast|prediction|predict|likely to sell|may sell/.test(question)) {
    if (!context.demandEstimate.available) {
      return 'There is not enough completed demand information yet for me to give a reliable expected-demand summary.';
    }

    if (context.searchTerm && context.matchingDemand.length) {
      const item = context.matchingDemand[0];

      return `${item.part_number || 'No part number'} – ${item.description} has an expected demand of about ${units(
        item.predicted_quantity
      )} unit(s) over the current ${context.demandEstimate.horizonDays}-day planning period. Current stock is ${units(
        item.current_stock
      )} unit(s)${
        safeNumber(item.recommended_quantity) > 0
          ? `, and the suggested restock is about ${Math.ceil(
              safeNumber(item.recommended_quantity)
            )} unit(s)`
          : ', and no additional restock is currently suggested'
      }.`;
    }

    if (!context.demandLeaders.length) {
      return 'A demand estimate is available, but there are no products with a positive expected quantity in the current planning period.';
    }

    return `The parts with the highest expected demand are: ${context.demandLeaders
      .slice(0, 6)
      .map(
        item =>
          `${item.part_number || 'No part number'} – ${item.description} (about ${units(
            item.predicted_quantity
          )} unit(s))`
      )
      .join('; ')}.`;
  }

  if (/supplier|where.*order|who.*supply/.test(question) && context.searchTerm) {
    const item = context.matchingDemand[0];

    if (!item) {
      return `I could not find a matching inventory item for “${context.searchTerm}”.`;
    }

    if (!item.supplier_name) {
      return `${item.part_number || 'No part number'} – ${item.description} does not have a primary supplier recorded yet.`;
    }

    return `The recorded supplier for ${item.part_number || 'this item'} – ${item.description} is ${item.supplier_name}.`;
  }

  if (/inventory value|stock value|value of inventory/.test(question)) {
    return `The current inventory cost value is about ${money(
      metrics.inventoryValue
    )}. The estimated retail value is about ${money(metrics.retailValue)}.`;
  }

  if (/how many products|number of products|total products|inventory count/.test(question)) {
    return `There are ${safeNumber(metrics.totalProducts).toLocaleString()} active products in the store inventory. ${safeNumber(
      metrics.lowStock
    ).toLocaleString()} are low in stock and ${safeNumber(
      metrics.outOfStock
    ).toLocaleString()} are out of stock.`;
  }

  if (context.searchTerm) {
    if (!context.matchingProducts.length) {
      return `I could not find an active inventory item matching “${context.searchTerm}”. Try the part number, brand, or a word from the item description.`;
    }

    const product = context.matchingProducts[0];

    if (/price|selling price|how much/.test(question)) {
      return `${product.part_number || 'No part number'} – ${product.description} is priced at ${money(
        product.selling_price
      )} per ${product.unit || 'unit'}.`;
    }

    if (/cost|purchase cost|unit cost/.test(question)) {
      return `${product.part_number || 'No part number'} – ${product.description} has a recorded unit cost of ${money(
        product.unit_cost
      )}.`;
    }

    if (/where|location|located/.test(question)) {
      return `${product.part_number || 'No part number'} – ${product.description} is recorded at ${
        product.location || 'no location has been assigned yet'
      }.`;
    }

    return `${product.part_number || 'No part number'} – ${product.description}: ${units(
      product.current_stock
    )} ${product.unit || 'unit(s)'} currently in stock. ${
      product.stock_status === 'out'
        ? 'It is out of stock.'
        : product.stock_status === 'low'
          ? 'It is running low.'
          : 'Stock level is currently okay.'
    }`;
  }

  return `I can help with your store records. Right now there are ${safeNumber(
    metrics.totalProducts
  ).toLocaleString()} active products, ${safeNumber(
    metrics.lowStock
  ).toLocaleString()} low-stock item(s), and ${safeNumber(
    metrics.outOfStock
  ).toLocaleString()} out-of-stock item(s). You can ask about stock availability, sales, prices, best-selling parts, slow-moving items, suppliers, restocking, inventory value, or expected demand.`;
}

async function geminiAnswer(message, context) {
  const prompt = `You are the NPG Autoparts Store Assistant speaking directly to the store owner.

The owner is not technical. Use simple business language and short, practical answers.

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

Do not reveal customer names, supplier email addresses, credentials, secrets, or private technical information.

STORE CONTEXT:
${JSON.stringify(context)}

OWNER QUESTION:
${compactText(message, 1000)}`;

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      config.GEMINI_MODEL
    )}:generateContent?key=${encodeURIComponent(config.GEMINI_API_KEY)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
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

export function assistantMode() {
  return config.GEMINI_API_KEY
    ? {
        mode: 'gemini',
        model: config.GEMINI_MODEL
      }
    : {
        mode: 'smart-local',
        model: null
      };
}

export async function answerAssistant(message) {
  const context = await loadContext(message);

  if (config.GEMINI_API_KEY) {
    try {
      const answer = await geminiAnswer(
        message,
        context
      );

      return {
        answer,
        mode: 'gemini',
        model: config.GEMINI_MODEL
      };
    } catch (error) {
      console.error(
        'Store assistant fallback:',
        error.message
      );
    }
  }

  return {
    answer: localAnswer(
      message,
      context
    ),
    mode: 'smart-local',
    model: null
  };
}
