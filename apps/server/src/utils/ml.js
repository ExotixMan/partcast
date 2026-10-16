import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { forecastProcessEnv } from './forecastEnvironment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const defaultScript = path.join(root, 'ml/train_forecast.py');
let cachedRuntime;
let pendingRuntime;
const exists = file => access(file).then(() => true, () => false);
function processOutput(command, args, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio:['ignore','pipe','pipe'],env:forecastProcessEnv()});
    let out='',err='';
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Object.assign(new Error('Forecast calculation timed out. Try fewer parts or a shorter horizon.'),{status:503,safe:true,code:'FORECAST_TIMEOUT'}));},timeoutMs);
    child.stdout.on('data',d=>{out=(out+d).slice(-8000);});
    child.stderr.on('data',d=>{err=(err+d).slice(-4000);});
    child.on('error',e=>{clearTimeout(timer);reject(e);});
    child.on('close',(code,signal)=>{clearTimeout(timer);code===0?resolve(out):reject(Object.assign(new Error(err.trim()||'The forecasting process could not finish.'),{status:code===2?422:503,safe:code===2,exitCode:code,signal}));});
  });
}
export async function resolveForecastRuntime() {
  const key=`${config.PYTHON_BIN}|${config.ML_SCRIPT_PATH}`;
  if(cachedRuntime?.key===key&&Date.now()-cachedRuntime.checkedAt<300000)return cachedRuntime;
  if(pendingRuntime?.key===key)return pendingRuntime.promise;
  const pending={key,promise:discoverForecastRuntime(key)};
  pendingRuntime=pending;
  try{return await pending.promise;}
  finally{if(pendingRuntime===pending)pendingRuntime=null;}
}
async function discoverForecastRuntime(key) {
  const configured=String(config.PYTHON_BIN||'').trim().replace(/^"(.*)"$/,'$1');
  const candidates=[configured,path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python'),'/opt/partcast-venv/bin/python','python3','python'].filter(Boolean);
  let python,versions;
  const failures=[];
  for(const candidate of [...new Set(candidates)]){
    try{const output=await processOutput(candidate,['-c','import json,platform,numpy,pandas,sklearn,xgboost; print(json.dumps({"python":platform.python_version(),"numpy":numpy.__version__,"pandas":pandas.__version__,"scikit_learn":sklearn.__version__,"xgboost":xgboost.__version__}))']);versions=JSON.parse(output.trim().split('\n').at(-1));python=candidate;break;}
    catch(error){failures.push({candidate:failures.length+1,code:error.code||error.exitCode||'IMPORT_FAILED',signal:error.signal||null,missing_module:/No module named ['"]([\w.]+)['"]/.exec(error.message)?.[1]||null});}
  }
  if(!python){
    console.error('Forecast runtime unavailable:',failures);
    const stopped=failures.some(f=>f.signal==='SIGKILL');
    throw Object.assign(new Error(stopped
      ? 'The server stopped the forecasting process. Retry after other calculations finish; ask the Super Admin to check Render memory limits if this continues.'
      : 'The API forecasting runtime is not installed. Complete the Render build setup, then redeploy the API.'),{status:503,safe:true,code:stopped?'FORECAST_RESOURCE_LIMIT':'FORECAST_SETUP_REQUIRED'});
  }
  let script=defaultScript;
  const requested=String(config.ML_SCRIPT_PATH||'').trim();
  for(const candidate of requested?[path.resolve(requested),path.resolve(root,requested)]:[]){if(await exists(candidate)){script=candidate;break;}}
  if(!await exists(script))throw Object.assign(new Error('The forecasting script is missing. Redeploy the complete PartCast API, including its ml folder.'),{status:503,safe:true});
  cachedRuntime={key,checkedAt:Date.now(),python,script,versions};return cachedRuntime;
}
export async function forecastingStatus() {
  try{const runtime=await resolveForecastRuntime();return {ready:true,message:'The forecasting engine is ready.',runtime_versions:runtime.versions};}
  catch(e){return {ready:false,message:e.message,code:e.code};}
}
export async function checkForecastReadiness(payload) {
  const runtime = await resolveForecastRuntime();
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'partcast-readiness-'));
  try {
    const input = path.join(tmp, 'input.json'), output = path.join(tmp, 'readiness.json');
    await writeFile(input, JSON.stringify(payload), {mode:0o600});
    await processOutput(runtime.python, [runtime.script, '--input', input, '--output', output, '--check-data'], 30000);
    return JSON.parse(await readFile(output, 'utf8'));
  } finally {
    await rm(tmp, {recursive:true, force:true});
  }
}
export function validateForecastResult(result,payload){
  const invalid=()=>{throw Object.assign(new Error('The forecasting engine returned invalid estimates. Ask the Super Admin to check the forecasting installation.'),{status:503,safe:true});};
  const horizon=Math.min(90,Math.max(7,Math.trunc(Number(payload.horizonDays??30))));
  const known=new Set((payload.observations||[]).map(row=>row.product_id));
  const origin=new Date(payload.asOfDate+'T00:00:00Z');
  if(!Number.isFinite(origin.getTime())||!Number.isInteger(horizon))invalid();
  const dates=new Set();
  for(let i=1;i<=horizon;i++){const day=new Date(origin);day.setUTCDate(day.getUTCDate()+i);dates.add(day.toISOString().slice(0,10));}
  if(!Array.isArray(result?.forecasts)||!result.forecasts.length)invalid();
  const seen=new Set(),parts=new Map();
  for(const row of result.forecasts){
    if(!row||typeof row.product_id!=='string'||!row.product_id.trim()||!known.has(row.product_id)||!dates.has(row.forecast_date)||!Number.isFinite(row.predicted_quantity)||row.predicted_quantity<0)invalid();
    const key=row.product_id+'|'+row.forecast_date;if(seen.has(key))invalid();seen.add(key);
    parts.set(row.product_id,(parts.get(row.product_id)||0)+1);
  }
  if(result.forecast_product_count!==parts.size||result.forecast_horizon_days!==horizon||[...parts.values()].some(n=>n!==horizon))invalid();
}
export async function runForecastPython(payload) {
  const runtime=await resolveForecastRuntime();
  const tmp=await mkdtemp(path.join(os.tmpdir(),'partcast-ml-'));
  const input=path.join(tmp,'input.json'),output=path.join(tmp,'output.json'),model=path.join(tmp,'xgboost-model.json');
  try{
    const request={asOfDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date()),...payload};
    await writeFile(input,JSON.stringify(request),'utf8');
    await processOutput(runtime.python,[runtime.script,'--input',input,'--output',output,'--model-out',model],120000);
    const result=JSON.parse(await readFile(output,'utf8'));
    validateForecastResult(result,request);
    const modelBuffer=await readFile(model);return {result,modelBuffer};
  }finally{await rm(tmp,{recursive:true,force:true});}
}
