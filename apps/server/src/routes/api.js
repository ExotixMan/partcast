import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { adminDb, userDb } from '../supabase.js';
import { requireRole,authorizeApi } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { fetchAll, cleanText } from '../utils/helpers.js';
import { importInventoryWorkbook, importLegacySalesWorkbook, importDemandTrainingWorkbook, importSpreadsheetAuto, isSupportedSpreadsheetName } from '../services/importers.js';
import { buildReportWorkbook } from '../utils/excel.js';
import { runForecastPython,forecastingStatus } from '../utils/ml.js';
import { answerAssistant, assistantMode } from '../services/assistant.js';

import storeRoutes from './store.js';
import {storeReport} from '../utils/storeReports.js';
import {amount,positiveAmount,category,barcode,reportDates,dateQuery} from '../utils/storeValidation.js';
import {neededRestock,normalizeRestock} from '../utils/restock.js';
const storeDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date());
const router = Router();
router.use(authorizeApi);
router.use(storeRoutes);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (isSupportedSpreadsheetName(file.originalname)) return cb(null, true);
    const error = new Error('Upload a spreadsheet in .xlsx, .xlsm, or .csv format. The file can have any name.');
    error.status = 415;
    return cb(error);
  }
});

const rolesWrite = requireRole('owner','admin','inventory_staff');
const rolesAdmin = requireRole('owner','admin');
const assistantLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });

router.get('/me', (req, res) => { const {accessToken,...user}=req.user;res.json({user}); });

router.get('/offline-snapshot', async (req,res,next) => {
  try {
    const [products,suppliers] = await Promise.all([
      fetchAll(() => adminDb.from('inventory_status').select('id,part_number,sub_number,description,brand,unit,location,current_stock,minimum_stock,safety_stock,unit_cost,selling_price,stock_status,updated_at,category,barcode,search_aliases,photo_paths').eq('active',true).order('id')),
      fetchAll(() => adminDb.from('suppliers').select('id,name').eq('active',true).order('id'))
    ]);
    res.json({products,suppliers,savedAt:new Date().toISOString()});
  } catch(e){next(e);}
});
router.get('/notifications', async (req,res,next) => {
  try {
    const [{data,error},{data:reads,error:readError}] = await Promise.all([
      adminDb.from('stock_notifications').select('*,product:products(description,part_number,current_stock,unit,minimum_stock)').is('resolved_at',null).order('created_at',{ascending:false}).limit(100),
      adminDb.from('notification_reads').select('notification_id').eq('user_id',req.user.id)
    ]);
    if(error||readError)throw error||readError;
    const ids=new Set((reads||[]).map(r=>r.notification_id));
    res.json({data:(data||[]).map(r=>({...r,read:ids.has(r.id)}))});
  }catch(e){next(e);}
});
router.post('/notifications/:id/read',async (req,res,next)=>{
  try{const id=z.string().uuid().parse(req.params.id);const {error}=await adminDb.from('notification_reads').upsert({notification_id:id,user_id:req.user.id},{onConflict:'notification_id,user_id'});if(error)throw error;res.json({ok:true});}catch(e){next(e);}
});

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
      neededRestock(adminDb.from('reorder_recommendations').select('*')).order('recommended_quantity', { ascending: false }).limit(8)
    ]);
    for (const r of [metrics, trend, fast, slow, latestRun, reorder]) if (r.error) throw r.error;
    res.json({
      metrics: metrics.data || {},
      salesTrend: trend.data || [],
      fastMoving: fast.data || [],
      slowMoving: slow.data || [],
      latestForecastRun: latestRun.data || null,
      reorder: (reorder.data || []).map(normalizeRestock)
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
    if (q) query = query.or(`part_number.ilike.%${q}%,description.ilike.%${q}%,brand.ilike.%${q}%,barcode.ilike.%${q}%,alias_text.ilike.%${q}%`);
    if(req.query.category && req.query.category!=='all') query=query.eq('category',category.parse(req.query.category));
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
      adminDb.from('demand_forecasts').select('forecast_date,predicted_quantity,run_id').eq('product_id', req.params.id).gte('forecast_date', storeDay()).order('forecast_date').limit(90)
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
      category:category.optional(),barcode,search_aliases:z.array(z.string().trim().min(1).max(80)).max(20).optional(),
      description: z.string().trim().min(2).max(500),
      brand: z.string().trim().max(120).nullable().optional(),
      unit: z.string().trim().max(40).nullable().optional(),
      location: z.string().trim().max(80).nullable().optional(),
      current_stock: amount.default(0),
      minimum_stock: amount.default(0),
      safety_stock: amount.default(0),
      unit_cost: amount.default(0),
      selling_price: amount.default(0)
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
      category:category.optional(),barcode,search_aliases:z.array(z.string().trim().min(1).max(80)).max(20).optional(),
      description: z.string().trim().min(2).max(500).optional(),
      brand: z.string().trim().max(120).nullable().optional(),
      unit: z.string().trim().max(40).nullable().optional(),
      location: z.string().trim().max(80).nullable().optional(),
      minimum_stock: amount.optional(),
      safety_stock: amount.optional(),
      unit_cost: amount.optional(),
      selling_price: amount.optional(),
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
      client_operation_id: z.string().uuid(),
      product_id: z.string().uuid(),
      tx_type: z.enum(['stock_in','stock_out','sale']),
      quantity: positiveAmount,
      unit_cost: amount.nullable().optional(),
      unit_price: amount.nullable().optional(),
      reference_no: z.string().trim().max(180).nullable().optional(),
      supplier_id: z.string().uuid().nullable().optional(),
      customer_name: z.string().trim().max(240).nullable().optional(),
      total_amount: amount.nullable().optional(),
      notes: z.string().trim().max(1000).nullable().optional(),
      occurred_at: z.string().datetime().optional()
    }).parse(req.body);
    const {client_operation_id,...payload}=body;
    const { data, error } = await userDb(req.user.accessToken).rpc('sync_inventory_movement', {
      p_operation_id: client_operation_id, p_payload: payload
    });
    if (error) throw error;
    await audit(req, body.tx_type, 'inventory_transaction', data, { product_id: body.product_id, quantity: body.quantity }).catch(() => console.error('Movement audit logging failed.'));
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
    if (type !== 'all') q = q.eq('tx_type', z.enum(['initial','stock_in','stock_out','sale']).parse(type));
    q=dateQuery(q,reportDates(req.query));
    const { data, error, count } = await q.order('occurred_at',{ascending:false}).range((page-1)*pageSize, page*pageSize-1);
    if (error) throw error;
    res.json({ data, count, page, pageSize });
  } catch (e) { next(e); }
});

router.get('/suppliers', async (req, res, next) => {
  try {
    const { data, error } = await adminDb.from('suppliers').select(req.user.role==='cashier'?'id,name':'*').eq('active',true).order('name');
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
      latest_unit_cost: amount.default(0),
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
    if (req.query.supplierId) q=q.eq('supplier_id',z.string().uuid().parse(req.query.supplierId));
    if (String(req.query.onlyNeeded ?? 'true') !== 'false') q = neededRestock(q);
    const { data, error } = await q.order('recommended_quantity',{ascending:false});
    if (error) throw error;
    res.json({ data: (data||[]).map(normalizeRestock) });
  } catch (e) { next(e); }
});

router.get('/forecast/runs', async (req,res,next) => {
  try {
    const { data, error } = await adminDb.from('forecast_runs').select('*').order('started_at',{ascending:false}).limit(30);
    if (error) throw error;
    res.json({ data });
  } catch(e){ next(e); }
});

router.get('/forecast/products', async (req,res,next) => {
  try {
    const { data: latest, error: latestError } = await adminDb.from('latest_completed_forecast_run').select('id,horizon_days,completed_at').maybeSingle();
    if (latestError) throw latestError;
    if (!latest) return res.json({ run: null, data: [] });
    const rows = await fetchAll(() => adminDb.from('demand_forecasts')
      .select('product_id,forecast_date,predicted_quantity,product:products(part_number,description,brand)')
      .eq('run_id', latest.id).gte('forecast_date', storeDay()).order('forecast_date'));
    const grouped = new Map();
    for (const row of rows) {
      const current = grouped.get(row.product_id) || {
        product_id: row.product_id,
        part_number: row.product?.part_number || null,
        description: row.product?.description || 'Product',
        brand: row.product?.brand || null,
        predicted_total: 0,
        forecast_days: 0
      };
      current.predicted_total += Number(row.predicted_quantity || 0);
      current.forecast_days += 1;
      grouped.set(row.product_id, current);
    }
    const data = [...grouped.values()].map(x => ({ ...x, predicted_total: Number(x.predicted_total.toFixed(2)) }))
      .sort((a,b) => b.predicted_total - a.predicted_total || a.description.localeCompare(b.description));
    res.json({ run: latest, data });
  } catch(e){ next(e); }
});

router.get('/forecast/product/:id', async (req,res,next) => {
  try {
    const { data, error } = await adminDb.from('demand_forecasts')
      .select('forecast_date,predicted_quantity,run_id,forecast_runs!inner(status,completed_at)')
      .eq('product_id',req.params.id).eq('forecast_runs.status','completed')
      .gte('forecast_date',storeDay()).order('forecast_date').limit(120);
    if (error) throw error;
    res.json({ data });
  } catch(e){ next(e); }
});

router.get('/forecast/status',async(req,res,next)=>{try{res.json(await forecastingStatus());}catch(e){next(e);}});

router.post('/forecast/train', rolesAdmin, async (req, res, next) => {
  try {
    const body = z.object({ horizonDays:z.coerce.number().int().min(7).max(90).default(30), includeProxy:z.boolean().default(false) }).parse(req.body || {});
    const runId = crypto.randomUUID();
    const observations = await fetchAll(() => {
      let q = adminDb.from('demand_observations').select('product_id,occurred_on,quantity,source');
      q = body.includeProxy
        ? q.in('source',['actual_sale','imported_training_data','legacy_transaction_proxy'])
        : q.in('source',['actual_sale','imported_training_data']);
      return q.order('occurred_on');
    });
    if (observations.length < 30) return res.status(422).json({ error: 'Not enough usable demand observations for XGBoost. Import the training-ready spreadsheet or record more actual sales.' });

    const runtime=await forecastingStatus();if(!runtime.ready)return res.status(503).json({error:runtime.message});
    const productIds = [...new Set(observations.map(o=>o.product_id))];
    const { data: created, error: runError } = await adminDb.from('forecast_runs').insert({
      id:runId,status:'running',horizon_days:body.horizonDays,include_proxy:body.includeProxy,
      training_rows:observations.length,product_count:productIds.length,started_by:req.user.id
    }).select('*').single();
    if (runError) throw runError;

    try {
      const asOfDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const { result, modelBuffer } = await runForecastPython({ observations, horizonDays:body.horizonDays,asOfDate });
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

router.post('/imports/spreadsheet', rolesAdmin, upload.single('file'), async (req,res,next) => {
  try {
    if (!req.file) return res.status(400).json({error:'Attach an .xlsx, .xlsm, or .csv spreadsheet.'});
    const kind = z.enum(['auto','inventory','legacy-sales','demand-training']).default('auto').parse(req.body.kind || 'auto');
    const useProxy = String(req.body.useProxy || 'false') === 'true';
    const result = await importSpreadsheetAuto(req.file.buffer, req.file.originalname, req.user.id, kind, useProxy);
    await audit(req,'import','spreadsheet',result.batchId,{file:req.file.originalname,detectedType:result.detectedType,rows:result.rowsImported});
    res.json(result);
  } catch(e){ next(e); }
});

router.post('/imports/demand-training', rolesAdmin, upload.single('file'), async (req,res,next) => {
  try {
    if (!req.file) return res.status(400).json({error:'Attach a demand-training spreadsheet.'});
    const result = await importDemandTrainingWorkbook(req.file.buffer, req.file.originalname, req.user.id);
    await audit(req,'import','demand_training_workbook',result.batchId,{file:req.file.originalname,rows:result.rowsImported});
    res.json(result);
  } catch(e){ next(e); }
});

router.post('/imports/inventory', rolesAdmin, upload.single('file'), async (req,res,next) => {
  try {
    if (!req.file) return res.status(400).json({error:'Attach an .xlsx, .xlsm, or .csv inventory spreadsheet.'});
    const result = await importInventoryWorkbook(req.file.buffer, req.file.originalname, req.user.id);
    await audit(req,'import','inventory_workbook',result.batchId,{file:req.file.originalname,rows:result.rowsImported});
    res.json(result);
  } catch(e){ next(e); }
});

router.post('/imports/legacy-sales', rolesAdmin, upload.single('file'), async (req,res,next) => {
  try {
    if (!req.file) return res.status(400).json({error:'Attach an .xlsx, .xlsm, or .csv sales spreadsheet.'});
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
    const sheets=await storeReport(type,req.query);
    const buffer = await buildReportWorkbook({title:`PartCast ${type}`,sheets});
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="partcast-${type}-${storeDay()}.xlsx"`);
    res.send(buffer);
  } catch(e){next(e);}
});

router.get('/data-quality', async (req,res,next) => {
  try {
    const [actual, imported, proxy, legacy, unmatched] = await Promise.all([
      adminDb.from('demand_observations').select('*',{count:'exact',head:true}).eq('source','actual_sale'),
      adminDb.from('demand_observations').select('*',{count:'exact',head:true}).eq('source','imported_training_data'),
      adminDb.from('demand_observations').select('*',{count:'exact',head:true}).eq('source','legacy_transaction_proxy'),
      adminDb.from('legacy_sales').select('*',{count:'exact',head:true}),
      adminDb.from('legacy_sales').select('*',{count:'exact',head:true}).is('matched_product_id',null)
    ]);
    for(const result of [actual,imported,proxy,legacy,unmatched])if(result.error)throw result.error;
    res.json({actualDemandRows:actual.count||0,importedTrainingRows:imported.count||0,proxyDemandRows:proxy.count||0,legacySalesRows:legacy.count||0,unmatchedLegacySales:unmatched.count||0});
  } catch(e){next(e);}
});

router.get('/assistant/status',async(req,res,next)=>{try{res.json(req.user.role==='cashier'?{mode:'database',model:null}:await assistantMode());}catch(e){next(e);}});
router.post('/assistant/chat', assistantLimiter, async (req,res,next) => {
  try {
    const body = z.object({ message: z.string().trim().min(1).max(1000),language:z.enum(['en','fil']).optional() }).parse(req.body || {});
    const result = await answerAssistant(body.message,body.language,req.user.role);
    res.json(result);
  } catch(e){ next(e); }
});

export default router;
