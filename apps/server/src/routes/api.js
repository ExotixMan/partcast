import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import crypto from 'node:crypto';
import { adminDb, userDb } from '../supabase.js';
import { requireRole } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { fetchAll, cleanText } from '../utils/helpers.js';
import { importInventoryWorkbook, importLegacySalesWorkbook } from '../services/importers.js';
import { buildReportWorkbook } from '../utils/excel.js';
import { runForecastPython } from '../utils/ml.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.xlsx$/i.test(file.originalname))
});

const rolesWrite = requireRole('owner','admin','inventory_staff');
const rolesAdmin = requireRole('owner','admin');

router.get('/me', (req, res) => res.json({ user: req.user }));

router.patch('/me', async (req,res,next) => {
  try {
    const body=z.object({full_name:z.string().trim().min(2).max(120)}).parse(req.body);
    const {data,error}=await adminDb.from('profiles').update({full_name:body.full_name}).eq('id',req.user.id).select('id,full_name,role,active').single();
    if(error) throw error;
    await audit(req,'update','profile',req.user.id,{fields:['full_name']});
    res.json({user:{...data,email:req.user.email}});
  } catch(e){next(e);}
});

router.get('/dashboard', async (req, res, next) => {
  try {
    const [metrics, trend, fast, slow, latestRun, reorder] = await Promise.all([
      adminDb.rpc('get_dashboard_metrics'),
      adminDb.rpc('get_sales_trend', { p_days: 30 }),
      adminDb.rpc('get_top_moving_products', { p_days: 90, p_limit: 8, p_direction: 'desc' }),
      adminDb.rpc('get_top_moving_products', { p_days: 90, p_limit: 8, p_direction: 'asc' }),
      adminDb.from('latest_completed_forecast_run').select('*').maybeSingle(),
      adminDb.from('reorder_recommendations').select('*').gt('recommended_quantity', 0).order('recommended_quantity', { ascending: false }).limit(8)
    ]);
    for (const r of [metrics, trend, fast, slow, latestRun, reorder]) if (r.error) throw r.error;
    res.json({
      metrics: metrics.data || {},
      salesTrend: trend.data || [],
      fastMoving: fast.data || [],
      slowMoving: slow.data || [],
      latestForecastRun: latestRun.data || null,
      reorder: reorder.data || []
    });
  } catch (e) { next(e); }
});

router.get('/products', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
    const q = String(req.query.q || '').trim().replace(/[^a-zA-Z0-9_\-./ ()]/g, '').slice(0, 80);
    const status = String(req.query.status || 'all');
    let query = adminDb.from('inventory_status').select('*', { count: 'exact' }).eq('active', true);
    if (q) query = query.or(`part_number.ilike.%${q}%,description.ilike.%${q}%,brand.ilike.%${q}%`);
    if (status === 'low') query = query.eq('stock_status', 'low');
    if (status === 'out') query = query.eq('stock_status', 'out');
    query = query.order('description').range((page - 1) * pageSize, page * pageSize - 1);
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, count, page, pageSize });
  } catch (e) { next(e); }
});

router.get('/products/:id', async (req, res, next) => {
  try {
    const [product, suppliers, tx, forecasts] = await Promise.all([
      adminDb.from('products').select('*').eq('id', req.params.id).single(),
      adminDb.from('product_suppliers').select('*,supplier:suppliers(*)').eq('product_id', req.params.id),
      adminDb.from('inventory_transactions').select('*').eq('product_id', req.params.id).order('occurred_at',{ascending:false}).limit(50),
      adminDb.from('demand_forecasts').select('forecast_date,predicted_quantity,run_id').eq('product_id', req.params.id).gte('forecast_date', new Date().toISOString().slice(0,10)).order('forecast_date').limit(90)
    ]);
    if (product.error) throw product.error;
    res.json({ product: product.data, suppliers: suppliers.data || [], transactions: tx.data || [], forecasts: forecasts.data || [] });
  } catch (e) { next(e); }
});

router.post('/products', rolesWrite, async (req, res, next) => {
  try {
    const body = z.object({
      part_number: z.string().trim().max(120).nullable().optional(),
      sub_number: z.string().trim().max(120).nullable().optional(),
      description: z.string().trim().min(2).max(500),
      brand: z.string().trim().max(120).nullable().optional(),
      unit: z.string().trim().max(40).nullable().optional(),
      location: z.string().trim().max(80).nullable().optional(),
      current_stock: z.coerce.number().min(0).default(0),
      minimum_stock: z.coerce.number().min(0).default(0),
      safety_stock: z.coerce.number().min(0).default(0),
      unit_cost: z.coerce.number().min(0).default(0),
      selling_price: z.coerce.number().min(0).default(0)
    }).parse(req.body);
    const initial = body.current_stock;
    const { data, error } = await adminDb.from('products').insert({ ...body, current_stock: 0 }).select('*').single();
    if (error) throw error;
    if (initial > 0) {
      const { error: txError } = await userDb(req.user.accessToken).rpc('apply_inventory_transaction', {
        p_product_id: data.id, p_tx_type: 'initial', p_quantity: initial,
        p_unit_cost: body.unit_cost, p_unit_price: body.selling_price,
        p_reference_no: 'INITIAL', p_notes: 'Initial stock when product was created'
      });
      if (txError) {
        await adminDb.from('products').delete().eq('id', data.id);
        throw txError;
      }
    }
    await audit(req, 'create', 'product', data.id, { part_number: body.part_number });
    res.status(201).json({ product: { ...data, current_stock: initial } });
  } catch (e) { next(e); }
});

router.patch('/products/:id', rolesWrite, async (req, res, next) => {
  try {
    const body = z.object({
      part_number: z.string().trim().max(120).nullable().optional(),
      sub_number: z.string().trim().max(120).nullable().optional(),
      description: z.string().trim().min(2).max(500).optional(),
      brand: z.string().trim().max(120).nullable().optional(),
      unit: z.string().trim().max(40).nullable().optional(),
      location: z.string().trim().max(80).nullable().optional(),
      minimum_stock: z.coerce.number().min(0).optional(),
      safety_stock: z.coerce.number().min(0).optional(),
      unit_cost: z.coerce.number().min(0).optional(),
      selling_price: z.coerce.number().min(0).optional(),
      active: z.boolean().optional()
    }).parse(req.body);
    const { data, error } = await adminDb.from('products').update(body).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    await audit(req, 'update', 'product', req.params.id, { fields: Object.keys(body) });
    res.json({ product: data });
  } catch (e) { next(e); }
});

router.post('/inventory/movement', rolesWrite, async (req, res, next) => {
  try {
    const body = z.object({
      product_id: z.string().uuid(),
      tx_type: z.enum(['stock_in','stock_out','sale']),
      quantity: z.coerce.number().positive(),
      unit_cost: z.coerce.number().min(0).nullable().optional(),
      unit_price: z.coerce.number().min(0).nullable().optional(),
      reference_no: z.string().trim().max(180).nullable().optional(),
      supplier_id: z.string().uuid().nullable().optional(),
      customer_name: z.string().trim().max(240).nullable().optional(),
      total_amount: z.coerce.number().min(0).nullable().optional(),
      notes: z.string().trim().max(1000).nullable().optional(),
      occurred_at: z.string().datetime().optional()
    }).parse(req.body);
    const { data, error } = await userDb(req.user.accessToken).rpc('apply_inventory_transaction', {
      p_product_id: body.product_id,
      p_tx_type: body.tx_type,
      p_quantity: body.quantity,
      p_unit_cost: body.unit_cost ?? null,
      p_unit_price: body.unit_price ?? null,
      p_reference_no: body.reference_no ?? null,
      p_supplier_id: body.supplier_id ?? null,
      p_customer_name: body.customer_name ?? null,
      p_total_amount: body.total_amount ?? null,
      p_notes: body.notes ?? null,
      p_occurred_at: body.occurred_at ?? new Date().toISOString()
    });
    if (error) throw error;
    await audit(req, body.tx_type, 'inventory_transaction', data, { product_id: body.product_id, quantity: body.quantity });
    res.status(201).json({ transactionId: data });
  } catch (e) { next(e); }
});

router.get('/transactions', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
    const type = String(req.query.type || 'all');
    let q = adminDb.from('inventory_transactions')
      .select('*,product:products(part_number,description,brand),supplier:suppliers(name)', { count: 'exact' });
    if (type !== 'all') q = q.eq('tx_type', type);
    const { data, error, count } = await q.order('occurred_at',{ascending:false}).range((page-1)*pageSize, page*pageSize-1);
    if (error) throw error;
    res.json({ data, count, page, pageSize });
  } catch (e) { next(e); }
});

router.get('/suppliers', async (req, res, next) => {
  try {
    const { data, error } = await adminDb.from('suppliers').select('*').eq('active',true).order('name');
    if (error) throw error;
    res.json({ data });
  } catch (e) { next(e); }
});

router.post('/suppliers', rolesAdmin, async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().trim().min(2).max(180), contact_person: z.string().trim().max(180).nullable().optional(),
      email: z.string().email().nullable().optional(), phone: z.string().trim().max(80).nullable().optional(),
      address: z.string().trim().max(500).nullable().optional()
    }).parse(req.body);
    const { data, error } = await adminDb.from('suppliers').insert(body).select('*').single();
    if (error) throw error;
    await audit(req, 'create', 'supplier', data.id, { name: data.name });
    res.status(201).json({ supplier: data });
  } catch (e) { next(e); }
});

router.patch('/suppliers/:id', rolesAdmin, async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().trim().min(2).max(180).optional(), contact_person: z.string().trim().max(180).nullable().optional(),
      email: z.string().email().nullable().optional(), phone: z.string().trim().max(80).nullable().optional(),
      address: z.string().trim().max(500).nullable().optional(), active: z.boolean().optional()
    }).parse(req.body);
    const { data, error } = await adminDb.from('suppliers').update(body).eq('id',req.params.id).select('*').single();
    if (error) throw error;
    await audit(req, 'update', 'supplier', req.params.id, { fields: Object.keys(body) });
    res.json({ supplier: data });
  } catch (e) { next(e); }
});

router.post('/products/:productId/suppliers/:supplierId', rolesAdmin, async (req, res, next) => {
  try {
    const body = z.object({
      latest_unit_cost: z.coerce.number().min(0).default(0),
      lead_time_days: z.coerce.number().int().min(0).max(365).default(7),
      supplier_part_number: z.string().trim().max(120).nullable().optional(),
      is_primary: z.boolean().default(false)
    }).parse(req.body);
    if (body.is_primary) await adminDb.from('product_suppliers').update({is_primary:false}).eq('product_id',req.params.productId);
    const { data, error } = await adminDb.from('product_suppliers').upsert({
      product_id:req.params.productId,supplier_id:req.params.supplierId,...body
    }, {onConflict:'product_id,supplier_id'}).select('*').single();
    if (error) throw error;
    await audit(req,'link_supplier','product',req.params.productId,{supplier_id:req.params.supplierId});
    res.json({ data });
  } catch (e) { next(e); }
});

router.get('/reorder', async (req, res, next) => {
  try {
    let q = adminDb.from('reorder_recommendations').select('*');
    if (String(req.query.onlyNeeded ?? 'true') !== 'false') q = q.gt('recommended_quantity',0);
    const { data, error } = await q.order('recommended_quantity',{ascending:false});
    if (error) throw error;
    res.json({ data });
  } catch (e) { next(e); }
});

router.get('/forecast/runs', async (req,res,next) => {
  try {
    const { data, error } = await adminDb.from('forecast_runs').select('*').order('started_at',{ascending:false}).limit(30);
    if (error) throw error;
    res.json({ data });
  } catch(e){ next(e); }
});

router.get('/forecast/product/:id', async (req,res,next) => {
  try {
    const { data, error } = await adminDb.from('demand_forecasts')
      .select('forecast_date,predicted_quantity,run_id,forecast_runs!inner(status,completed_at)')
      .eq('product_id',req.params.id).eq('forecast_runs.status','completed')
      .gte('forecast_date',new Date().toISOString().slice(0,10)).order('forecast_date').limit(120);
    if (error) throw error;
    res.json({ data });
  } catch(e){ next(e); }
});

router.post('/forecast/train', rolesAdmin, async (req, res, next) => {
  try {
    const body = z.object({ horizonDays:z.coerce.number().int().min(7).max(90).default(30), includeProxy:z.boolean().default(false) }).parse(req.body || {});
    const runId = crypto.randomUUID();
    const observations = await fetchAll(() => {
      let q = adminDb.from('demand_observations').select('product_id,occurred_on,quantity,source');
      if (!body.includeProxy) q = q.eq('source','actual_sale');
      return q.order('occurred_on');
    });
    if (observations.length < 30) return res.status(422).json({ error: 'Not enough demand observations for XGBoost. Record more sales or explicitly include legacy transaction proxies.' });

    const productIds = [...new Set(observations.map(o=>o.product_id))];
    const { data: created, error: runError } = await adminDb.from('forecast_runs').insert({
      id:runId,status:'running',horizon_days:body.horizonDays,include_proxy:body.includeProxy,
      training_rows:observations.length,product_count:productIds.length,started_by:req.user.id
    }).select('*').single();
    if (runError) throw runError;

    try {
      const { result, modelBuffer } = await runForecastPython({ observations, horizonDays:body.horizonDays });
      const modelPath = `models/${runId}.json`;
      const upload = await adminDb.storage.from('partcast-models').upload(modelPath, modelBuffer, { contentType:'application/json', upsert:true });
      if (upload.error) throw upload.error;
      const forecastRows = result.forecasts.map(f => ({ run_id:runId,product_id:f.product_id,forecast_date:f.forecast_date,predicted_quantity:f.predicted_quantity }));
      for (let i=0;i<forecastRows.length;i+=500) {
        const { error } = await adminDb.from('demand_forecasts').insert(forecastRows.slice(i,i+500));
        if (error) throw error;
      }
      const { error: completeError } = await adminDb.from('forecast_runs').update({
        status:'completed',model_version:result.model_version,metrics:result.metrics,
        training_date_min:result.training_date_min,training_date_max:result.training_date_max,
        model_storage_path:modelPath,completed_at:new Date().toISOString()
      }).eq('id',runId);
      if (completeError) throw completeError;
      await audit(req,'train','forecast_run',runId,{rows:observations.length,products:productIds.length,includeProxy:body.includeProxy});
      res.json({ runId, metrics:result.metrics, forecastCount:forecastRows.length });
    } catch (inner) {
      await adminDb.from('forecast_runs').update({status:'failed',error_message:String(inner.message).slice(0,1000),completed_at:new Date().toISOString()}).eq('id',runId);
      throw inner;
    }
  } catch (e) { next(e); }
});

router.post('/imports/inventory', rolesAdmin, upload.single('file'), async (req,res,next) => {
  try {
    if (!req.file) return res.status(400).json({error:'Attach an .xlsx inventory workbook.'});
    const result = await importInventoryWorkbook(req.file.buffer, req.file.originalname, req.user.id);
    await audit(req,'import','inventory_workbook',result.batchId,{file:req.file.originalname,rows:result.rowsImported});
    res.json(result);
  } catch(e){ next(e); }
});

router.post('/imports/legacy-sales', rolesAdmin, upload.single('file'), async (req,res,next) => {
  try {
    if (!req.file) return res.status(400).json({error:'Attach an .xlsx sales workbook.'});
    const useProxy = String(req.body.useProxy || 'false') === 'true';
    const result = await importLegacySalesWorkbook(req.file.buffer, req.file.originalname, req.user.id, useProxy);
    await audit(req,'import','legacy_sales_workbook',result.batchId,{file:req.file.originalname,rows:result.rowsImported,useProxy});
    res.json(result);
  } catch(e){ next(e); }
});

router.get('/imports', rolesAdmin, async (req,res,next) => {
  try {
    const {data,error}=await adminDb.from('import_batches').select('*').order('created_at',{ascending:false}).limit(50);
    if(error) throw error;
    res.json({data});
  } catch(e){next(e);}
});

router.get('/reports/:type.xlsx', async (req,res,next) => {
  try {
    const type = req.params.type;
    let sheets;
    if (type === 'inventory') {
      const rows = await fetchAll(() => adminDb.from('products').select('part_number,description,brand,current_stock,minimum_stock,safety_stock,unit,location,unit_cost,selling_price').eq('active',true).order('description'));
      sheets=[{name:'Inventory',rows,columns:[
        {header:'Part Number',key:'part_number'},{header:'Description',key:'description'},{header:'Brand',key:'brand'},
        {header:'Current Stock',key:'current_stock'},{header:'Minimum Stock',key:'minimum_stock'},{header:'Safety Stock',key:'safety_stock'},
        {header:'Unit',key:'unit'},{header:'Location',key:'location'},{header:'Unit Cost',key:'unit_cost'},{header:'Selling Price',key:'selling_price'}
      ]}];
    } else if (type === 'reorder') {
      const {data,error}=await adminDb.from('reorder_recommendations').select('*').gt('recommended_quantity',0).order('recommended_quantity',{ascending:false});
      if(error) throw error;
      sheets=[{name:'Reorder Recommendations',rows:data,columns:[
        {header:'Part Number',key:'part_number'},{header:'Description',key:'description'},{header:'Current Stock',key:'current_stock'},
        {header:'Predicted Demand',key:'predicted_quantity'},{header:'Recommended Qty',key:'recommended_quantity'},
        {header:'Supplier',key:'supplier_name'},{header:'Supplier Email',key:'supplier_email'},{header:'Estimated Cost',key:'estimated_order_cost'}
      ]}];
    } else if (type === 'transactions') {
      const rows = await fetchAll(() => adminDb.from('inventory_transactions').select('occurred_at,tx_type,quantity,reference_no,customer_name,total_amount,notes,product:products(part_number,description),supplier:suppliers(name)').order('occurred_at',{ascending:false}));
      const flat=rows.map(r=>({...r,part_number:r.product?.part_number,description:r.product?.description,supplier_name:r.supplier?.name}));
      sheets=[{name:'Transactions',rows:flat,columns:[
        {header:'Date',key:'occurred_at'},{header:'Type',key:'tx_type'},{header:'Part Number',key:'part_number'},
        {header:'Description',key:'description'},{header:'Quantity',key:'quantity'},{header:'Reference',key:'reference_no'},
        {header:'Supplier',key:'supplier_name'},{header:'Customer',key:'customer_name'},{header:'Amount',key:'total_amount'},{header:'Notes',key:'notes'}
      ]}];
    } else return res.status(404).json({error:'Unknown report type.'});

    const buffer = await buildReportWorkbook({title:`PartCast ${type}`,sheets});
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="partcast-${type}-${new Date().toISOString().slice(0,10)}.xlsx"`);
    res.send(buffer);
  } catch(e){next(e);}
});

router.get('/data-quality', async (req,res,next) => {
  try {
    const [actual, proxy, legacy, unmatched] = await Promise.all([
      adminDb.from('demand_observations').select('*',{count:'exact',head:true}).eq('source','actual_sale'),
      adminDb.from('demand_observations').select('*',{count:'exact',head:true}).eq('source','legacy_transaction_proxy'),
      adminDb.from('legacy_sales').select('*',{count:'exact',head:true}),
      adminDb.from('legacy_sales').select('*',{count:'exact',head:true}).is('matched_product_id',null)
    ]);
    res.json({actualDemandRows:actual.count||0,proxyDemandRows:proxy.count||0,legacySalesRows:legacy.count||0,unmatchedLegacySales:unmatched.count||0});
  } catch(e){next(e);}
});

export default router;
