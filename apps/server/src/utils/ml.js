import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const defaultScript = path.join(root, 'ml/train_forecast.py');
let cachedRuntime;
const exists = file => access(file).then(() => true, () => false);
function processOutput(command, args, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONUNBUFFERED:'1'}});
    let out='',err='';
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Object.assign(new Error('Forecast calculation timed out. Try fewer parts or a shorter horizon.'),{status:503,safe:true}));},timeoutMs);
    child.stdout.on('data',d=>{out=(out+d).slice(-8000);});
    child.stderr.on('data',d=>{err=(err+d).slice(-4000);});
    child.on('error',e=>{clearTimeout(timer);reject(e);});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve(out):reject(Object.assign(new Error(err.trim()||'The forecasting process could not finish.'),{status:code===2?422:503,safe:code===2}));});
  });
}
export async function resolveForecastRuntime() {
  const key=`${config.PYTHON_BIN}|${config.ML_SCRIPT_PATH}`;
  if(cachedRuntime?.key===key&&Date.now()-cachedRuntime.checkedAt<300000)return cachedRuntime;
  const configured=String(config.PYTHON_BIN||'').trim().replace(/^"(.*)"$/,'$1');
  const candidates=[configured,path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python'),'/opt/partcast-venv/bin/python','python3','python'].filter(Boolean);
  let python;
  for(const candidate of [...new Set(candidates)]){
    try{await processOutput(candidate,['-c','import numpy,pandas,sklearn,xgboost; print("partcast-ready")']);python=candidate;break;}catch{/* Try a runtime installed on this machine. */}
  }
  if(!python)throw Object.assign(new Error('Demand prediction needs Python with numpy, pandas, scikit-learn and xgboost. Ask the Super Admin to run the project setup and restart the API.'),{status:503,safe:true});
  let script=defaultScript;
  const requested=String(config.ML_SCRIPT_PATH||'').trim();
  for(const candidate of requested?[path.resolve(requested),path.resolve(root,requested)]:[]){if(await exists(candidate)){script=candidate;break;}}
  if(!await exists(script))throw Object.assign(new Error('The forecasting script is missing. Redeploy the complete PartCast API, including its ml folder.'),{status:503,safe:true});
  cachedRuntime={key,checkedAt:Date.now(),python,script};return cachedRuntime;
}
export async function forecastingStatus() {
  try{await resolveForecastRuntime();return {ready:true,message:'The forecasting engine is ready.'};}
  catch(e){return {ready:false,message:e.message};}
}
export async function runForecastPython(payload) {
  const runtime=await resolveForecastRuntime();
  const tmp=await mkdtemp(path.join(os.tmpdir(),'partcast-ml-'));
  const input=path.join(tmp,'input.json'),output=path.join(tmp,'output.json'),model=path.join(tmp,'xgboost-model.json');
  try{
    await writeFile(input,JSON.stringify({asOfDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date()),...payload}),'utf8');
    await processOutput(runtime.python,[runtime.script,'--input',input,'--output',output,'--model-out',model],120000);
    const result=JSON.parse(await readFile(output,'utf8'));
    if(!Array.isArray(result.forecasts)||!result.forecasts.length||result.forecasts.some(f=>!Number.isFinite(f.predicted_quantity)||f.predicted_quantity<0))throw Object.assign(new Error('The forecasting engine returned invalid estimates. Ask the Super Admin to check the forecasting installation.'),{status:503,safe:true});
    const modelBuffer=await readFile(model);return {result,modelBuffer};
  }finally{await rm(tmp,{recursive:true,force:true});}
}
