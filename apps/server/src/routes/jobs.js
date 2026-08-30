import { Router } from 'express';
import crypto from 'node:crypto';
import { adminDb } from '../supabase.js';
import { buildBackupWorkbook } from '../utils/excel.js';
import { fetchAll } from '../utils/helpers.js';
import { recommendationHash, sendSupplierEmail } from '../utils/email.js';
import { runForecastPython } from '../utils/ml.js';
import { config } from '../config.js';

const router = Router();

async function createBackup(actorId = null) {
  const [products, transactions, suppliers, productSuppliers, demandObservations, forecastRuns, forecasts, legacySales, purchaseHistory, importBatches, profiles, settings] = await Promise.all([
    fetchAll(() => adminDb.from('products').select('*').order('description')),
    fetchAll(() => adminDb.from('inventory_transactions').select('*,product:products(part_number,description),supplier:suppliers(name)').order('occurred_at',{ascending:false})),
    fetchAll(() => adminDb.from('suppliers').select('*').order('name')),
    fetchAll(() => adminDb.from('product_suppliers').select('*,product:products(part_number,description),supplier:suppliers(name,email)').order('updated_at',{ascending:false})),
    fetchAll(() => adminDb.from('demand_observations').select('*,product:products(part_number,description)').order('occurred_on',{ascending:false})),
    fetchAll(() => adminDb.from('forecast_runs').select('*').order('started_at',{ascending:false})),
    fetchAll(() => adminDb.from('demand_forecasts').select('*,product:products(part_number,description)').order('forecast_date',{ascending:false})),
    fetchAll(() => adminDb.from('legacy_sales').select('*').order('sale_date',{ascending:false})),
    fetchAll(() => adminDb.from('purchase_history').select('*,supplier:suppliers(name)').order('purchase_date',{ascending:false})),
    fetchAll(() => adminDb.from('import_batches').select('*').order('created_at',{ascending:false})),
    fetchAll(() => adminDb.from('profiles').select('id,full_name,role,active,created_at,updated_at').order('created_at')),
    fetchAll(() => adminDb.from('system_settings').select('*').order('key'))
  ]);

  const txFlat = transactions.map(r => ({ ...r, part_number:r.product?.part_number, description:r.product?.description, supplier_name:r.supplier?.name }));
  const productSupplierFlat = productSuppliers.map(r => ({ ...r, part_number:r.product?.part_number, description:r.product?.description, supplier_name:r.supplier?.name, supplier_email:r.supplier?.email }));
  const observationFlat = demandObservations.map(r => ({ ...r, part_number:r.product?.part_number, description:r.product?.description }));
  const forecastRunFlat = forecastRuns.map(r => ({ ...r, metrics:r.metrics ? JSON.stringify(r.metrics) : null }));
  const forecastFlat = forecasts.map(r => ({ ...r, part_number:r.product?.part_number, description:r.product?.description }));
  const purchaseFlat = purchaseHistory.map(r => ({ ...r, supplier_name:r.supplier?.name }));
  const importBatchFlat = importBatches.map(r => ({ ...r, warnings:r.warnings ? JSON.stringify(r.warnings) : null }));
  const settingFlat = settings.map(r => ({ ...r, value:JSON.stringify(r.value) }));
  const buffer = await buildBackupWorkbook({ products, transactions:txFlat, suppliers, productSuppliers:productSupplierFlat, demandObservations:observationFlat, forecastRuns:forecastRunFlat, forecasts:forecastFlat, legacySales, purchaseHistory:purchaseFlat, importBatches:importBatchFlat, profiles, settings:settingFlat });
  const stamp = new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
  const fileName = `partcast-backup-${stamp}.xlsx`;
  const storagePath = `daily/${fileName}`;
  const { error: uploadError } = await adminDb.storage.from('partcast-backups').upload(storagePath, buffer, {
    contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert:false
  });
  if (uploadError) throw uploadError;
  const { data: log, error: logError } = await adminDb.from('backup_logs').insert({
    storage_path:storagePath,file_name:fileName,status:'created',size_bytes:buffer.length,created_by:actorId
  }).select('*').single();
  if (logError) throw logError;

  const { data: retentionSetting } = await adminDb.from('system_settings').select('value').eq('key','backup_retention_days').maybeSingle();
  const retentionDays = Number(retentionSetting?.value || config.BACKUP_RETENTION_DAYS);
  const cutoff = Date.now() - retentionDays * 86400000;
  const { data:list } = await adminDb.storage.from('partcast-backups').list('daily',{limit:1000,sortBy:{column:'created_at',order:'asc'}});
  const old = (list || []).filter(f => f.created_at && new Date(f.created_at).getTime() < cutoff).map(f => `daily/${f.name}`);
  if (old.length) await adminDb.storage.from('partcast-backups').remove(old);
  return log;
}

async function trainForecast({ includeProxy=false, horizonDays=30, actorId=null }) {
  const observations = await fetchAll(() => {
    let q = adminDb.from('demand_observations').select('product_id,occurred_on,quantity,source').order('occurred_on');
    if (!includeProxy) q = q.eq('source','actual_sale');
    return q;
  });
  if (observations.length < 30) return { skipped:true, reason:'Not enough demand observations.' };
  const runId = crypto.randomUUID();
  const productCount = new Set(observations.map(o=>o.product_id)).size;
  await adminDb.from('forecast_runs').insert({
    id:runId,status:'running',horizon_days:horizonDays,include_proxy:includeProxy,
    training_rows:observations.length,product_count:productCount,started_by:actorId
  });
  try {
    const {result,modelBuffer}=await runForecastPython({observations,horizonDays});
    const modelPath=`models/${runId}.json`;
    const upload=await adminDb.storage.from('partcast-models').upload(modelPath,modelBuffer,{contentType:'application/json',upsert:true});
    if(upload.error) throw upload.error;
    const rows=result.forecasts.map(f=>({run_id:runId,product_id:f.product_id,forecast_date:f.forecast_date,predicted_quantity:f.predicted_quantity}));
    for(let i=0;i<rows.length;i+=500){ const ins=await adminDb.from('demand_forecasts').insert(rows.slice(i,i+500)); if(ins.error) throw ins.error; }
    const done=await adminDb.from('forecast_runs').update({
      status:'completed',model_version:result.model_version,metrics:result.metrics,
      training_date_min:result.training_date_min,training_date_max:result.training_date_max,
      model_storage_path:modelPath,completed_at:new Date().toISOString()
    }).eq('id',runId);
    if(done.error) throw done.error;
    return {skipped:false,runId,metrics:result.metrics,forecastCount:rows.length};
  } catch(error){
    await adminDb.from('forecast_runs').update({status:'failed',error_message:String(error.message).slice(0,1000),completed_at:new Date().toISOString()}).eq('id',runId);
    throw error;
  }
}

async function autoEmailSuppliers(actorId = null) {
  const { data: setting } = await adminDb.from('system_settings').select('value').eq('key','auto_supplier_email_enabled').maybeSingle();
  if (setting?.value !== true) return { skipped:true, reason:'Automatic supplier email is disabled.' };
  const { data: cooldownSetting } = await adminDb.from('system_settings').select('value').eq('key','supplier_email_cooldown_days').maybeSingle();
  const cooldownDays = Number(cooldownSetting?.value || 3);
  const { data: rows, error } = await adminDb.from('reorder_recommendations').select('*').gt('recommended_quantity',0).not('supplier_id','is',null).not('supplier_email','is',null).order('supplier_name');
  if(error) throw error;

  const grouped = new Map();
  for(const row of rows || []){
    if(!grouped.has(row.supplier_id)) grouped.set(row.supplier_id,[]);
    grouped.get(row.supplier_id).push(row);
  }
  const results=[];
  for(const [supplierId,items] of grouped){
    const supplier={id:supplierId,name:items[0].supplier_name,email:items[0].supplier_email};
    const hash=recommendationHash(items);
    const since=new Date(Date.now()-cooldownDays*86400000).toISOString();
    const { data:last }=await adminDb.from('supplier_email_logs').select('*').eq('supplier_id',supplierId).eq('recommendation_hash',hash).eq('status','sent').gte('sent_at',since).limit(1);
    if(last?.length){ results.push({supplier:supplier.name,status:'skipped',reason:'same recommendation recently sent'}); continue; }
    try{
      const provider=await sendSupplierEmail({supplier,items});
      await adminDb.from('supplier_email_logs').insert({supplier_id:supplierId,recipient_email:supplier.email,subject:`NPG Autoparts replenishment request`,recommendation_hash:hash,item_count:items.length,status:'sent',provider_message_id:provider.messageId||null,sent_by:actorId});
      results.push({supplier:supplier.name,status:'sent',items:items.length});
    }catch(e){
      await adminDb.from('supplier_email_logs').insert({supplier_id:supplierId,recipient_email:supplier.email,subject:`NPG Autoparts replenishment request`,recommendation_hash:hash,item_count:items.length,status:'failed',error_message:String(e.message).slice(0,500),sent_by:actorId});
      results.push({supplier:supplier.name,status:'failed',error:e.message});
    }
  }
  return {skipped:false,results};
}

router.post('/backup', async (req,res,next)=>{ try{res.json({backup:await createBackup(null)});}catch(e){next(e);} });
router.post('/forecast', async (req,res,next)=>{
  try{
    const {data:setting}=await adminDb.from('system_settings').select('value').eq('key','forecast_horizon_days').maybeSingle();
    const horizonDays=Math.min(90,Math.max(7,Number(setting?.value||30)));
    res.json(await trainForecast({includeProxy:false,horizonDays,actorId:null}));
  }catch(e){next(e);}
});
router.post('/supplier-email', async (req,res,next)=>{ try{res.json(await autoEmailSuppliers(null));}catch(e){next(e);} });
router.post('/daily', async (req,res,next)=>{
  try{
    const backup=await createBackup(null);
    const email=await autoEmailSuppliers(null);
    res.json({backup,email});
  }catch(e){next(e);}
});

export { createBackup, trainForecast, autoEmailSuppliers };
export default router;
