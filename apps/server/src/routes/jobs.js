import { Router } from 'express';
import crypto from 'node:crypto';
import { adminDb } from '../supabase.js';
import { buildBackupWorkbook } from '../utils/excel.js';
import { fetchAll } from '../utils/helpers.js';
import { runForecastPython } from '../utils/ml.js';
import {getDataEnvironment,markForecastMetrics} from '../services/dataEnvironment.js';
import { config } from '../config.js';

const router = Router();

async function createBackup(actorId = null) {
  const [products, transactions, suppliers, productSuppliers, demandObservations, forecastRuns, forecasts, legacySales, purchaseHistory, importBatches, profiles, settings,stockBatches,customerDebts,debtPayments] = await Promise.all([
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
    fetchAll(() => adminDb.from('system_settings').select('*').order('key')),
    fetchAll(()=>adminDb.from('stock_batches').select('*').order('occurred_at')),
    fetchAll(()=>adminDb.from('customer_balances').select('*').order('occurred_at')),
    fetchAll(()=>adminDb.from('debt_payments').select('*').order('paid_at'))
  ]);

  const txFlat = transactions.map(r => ({ ...r, part_number:r.product?.part_number, description:r.product?.description, supplier_name:r.supplier?.name }));
  const productSupplierFlat = productSuppliers.map(r => ({ ...r, part_number:r.product?.part_number, description:r.product?.description, supplier_name:r.supplier?.name, supplier_email:r.supplier?.email }));
  const observationFlat = demandObservations.map(r => ({ ...r, part_number:r.product?.part_number, description:r.product?.description }));
  const forecastRunFlat = forecastRuns.map(r => ({ ...r, metrics:r.metrics ? JSON.stringify(r.metrics) : null }));
  const forecastFlat = forecasts.map(r => ({ ...r, part_number:r.product?.part_number, description:r.product?.description }));
  const purchaseFlat = purchaseHistory.map(r => ({ ...r, supplier_name:r.supplier?.name }));
  const importBatchFlat = importBatches.map(r => ({ ...r, warnings:r.warnings ? JSON.stringify(r.warnings) : null }));
  const settingFlat = settings.map(r => ({ ...r, value:JSON.stringify(r.value) }));
  const buffer = await buildBackupWorkbook({ stockBatches,customerDebts,debtPayments,products:products.map(p=>({...p,search_aliases:(p.search_aliases||[]).join(', '),photo_paths:(p.photo_paths||[]).join(', ')})), transactions:txFlat, suppliers, productSuppliers:productSupplierFlat, demandObservations:observationFlat, forecastRuns:forecastRunFlat, forecasts:forecastFlat, legacySales, purchaseHistory:purchaseFlat, importBatches:importBatchFlat, profiles, settings:settingFlat });
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
  if(includeProxy)throw Object.assign(new Error('Forecasting requires actual sold quantities. Use the separate demo for simulated demand.'),{status:422});
  const environment=await getDataEnvironment();
  const observations = await fetchAll(() => {
    const q = adminDb.from('demand_observations').select('product_id,occurred_on,quantity,source').in('source',environment.sources);
    return q.order('occurred_on').order('id');
  });
  if (observations.length < 30) return { skipped:true, reason:'Not enough demand observations.' };
  const runId = crypto.randomUUID();
  const productCount = new Set(observations.map(o=>o.product_id)).size;
  const {error:runError}=await adminDb.from('forecast_runs').insert({
    id:runId,status:'running',horizon_days:horizonDays,include_proxy:includeProxy,
    training_rows:observations.length,product_count:productCount,started_by:actorId
  });
  if(runError)throw runError;
  try {
    const {result,modelBuffer}=await runForecastPython({observations,horizonDays});
    const modelPath=`models/${runId}.json`;
    const upload=await adminDb.storage.from('partcast-models').upload(modelPath,modelBuffer,{contentType:'application/json',upsert:true});
    if(upload.error) throw upload.error;
    const rows=result.forecasts.map(f=>({run_id:runId,product_id:f.product_id,forecast_date:f.forecast_date,predicted_quantity:f.predicted_quantity}));
    for(let i=0;i<rows.length;i+=500){ const ins=await adminDb.from('demand_forecasts').insert(rows.slice(i,i+500)); if(ins.error) throw ins.error; }
    const done=await adminDb.from('forecast_runs').update({
      status:'completed',model_version:result.model_version,metrics:markForecastMetrics(result.metrics,environment),
      training_date_min:result.training_date_min,training_date_max:result.training_date_max,
      model_storage_path:modelPath,completed_at:new Date().toISOString()
    }).eq('id',runId);
    if(done.error) throw done.error;
    return {skipped:false,runId,metrics:markForecastMetrics(result.metrics,environment),forecastCount:rows.length};
  } catch(error){
    await adminDb.from('forecast_runs').update({status:'failed',error_message:String(error.message).slice(0,1000),completed_at:new Date().toISOString()}).eq('id',runId);
    throw error;
  }
}

async function autoEmailSuppliers() {

  return {skipped:true,reason:'Supplier emails require staff review. Open Restock to edit and send a request.'};
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
