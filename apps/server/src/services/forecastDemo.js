import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadSpreadsheet} from '../utils/spreadsheet.js';
import {excelDate} from '../utils/helpers.js';
import {isSimulationWorksheetName} from '../utils/simulationData.js';
import {isDemandQuantityHeader} from '../utils/demandHeaders.js';
import {forecastProcessEnv} from '../utils/forecastEnvironment.js';

const script = fileURLToPath(new URL('../../../../ml/evaluate_demo_workbook.py', import.meta.url));
const bad = message => Object.assign(new Error(message), {status:422, safe:true});
const scalar = value => value && typeof value === 'object' && 'result' in value ? value.result : value;
const label = value => String(scalar(value) ?? '').trim();
const marker = value => /(?:synthetic|simulat(?:ed|ion)|(?:^|[_\s-])(?:demo|modeled|modelled|owner[_\s-]informed[_\s-]model)(?:$|[_\s-]))/i.test(label(value));

export function containsSimulatedDemand(workbook) {
  for (const sheet of workbook.worksheets) {
    for (let r = 1; r <= Math.min(30, sheet.rowCount); r++) {
      const row = sheet.getRow(r);
      const headers = row.values.map(value => label(value).toLowerCase().replace(/\s+/g,' '));
      const dateHeader = headers.some(value=>['date','sale date','demand date','transaction date'].includes(value));
      const partHeader = headers.some(value=>value.includes('part number')||['part no','part no.','part #','part#','partnumber','sku','product code'].includes(value));
      const quantityHeader = headers.some(isDemandQuantityHeader);
      if (!dateHeader || !partHeader || !quantityHeader) continue;
      if (isSimulationWorksheetName(sheet.name)) return true;
      const columns = headers.flatMap((value, index) => ['tier','source','data type','dataset type','data_type','dataset_type','coverage','evidence type'].includes(value)||value.includes('training tier')||value.includes('demand source') ? [index] : []);
      for (let index = r + 1; index <= sheet.rowCount; index++) {
        if (columns.some(column => marker(sheet.getRow(index).getCell(column).value))) return true;
      }
      break;
    }
  }
  return false;
}

export async function demoWorkbookPayload(buffer, filename) {
  const workbook = await loadSpreadsheet(buffer, filename);
  const splits = {};
  for (const [name, sheetName] of Object.entries({train:'IMPORT_Train_5Col', validation:'Validation_5Col', test:'Test_5Col'})) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) throw bad('The demo workbook needs IMPORT_Train_5Col, Validation_5Col and Test_5Col worksheets.');
    if (sheet.rowCount > 50001) throw bad('Use at most 50,000 daily records per demo split.');
    const headers = sheet.getRow(1).values.map(value => label(value).toLowerCase());
    const columns = Object.fromEntries(['date','part number','demand quantity','tier'].map(key => [key, headers.indexOf(key)]));
    if (Object.values(columns).some(column => column < 1)) throw bad('Each demo worksheet needs Date, Part Number, Demand Quantity and Tier columns.');
    splits[name] = [];
    for (let index = 2; index <= sheet.rowCount; index++) {
      const row = sheet.getRow(index);
      const raw = key => scalar(row.getCell(columns[key]).value);
      if (Object.keys(columns).every(key => raw(key) == null || label(raw(key)) === '')) continue;
      const quantity = raw('demand quantity');
      if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0) throw bad('Every demo day needs an explicit numeric quantity, including zero.');
      const rawDate = raw('date');
      const date = rawDate instanceof Date ? rawDate.toISOString().slice(0,10) : typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
      if (!date || !excelDate(date)) throw bad('Use unambiguous YYYY-MM-DD demo dates.');
      const tier = label(raw('tier')).toLowerCase();
      if (!['synthetic_simulated','simulated_demo','owner_informed_model'].includes(tier)) throw bad('Keep actual sales separate. Every row in a demo split must be explicitly labelled synthetic_simulated, simulated_demo or owner_informed_model.');
      splits[name].push({date, part_number:label(raw('part number')), quantity, tier:tier==='owner_informed_model'?'simulated_demo':tier, source_tier:tier});
    }
  }
  return {dataset_type:'SIMULATED_DEMO', filename:path.basename(filename), source_sha256:crypto.createHash('sha256').update(buffer).digest('hex'), splits};
}

export async function runDemoWorkbook(buffer, filename) {
  const payload = await demoWorkbookPayload(buffer, filename);
  const {resolveForecastRuntime} = await import('../utils/ml.js');
  const runtime = await resolveForecastRuntime();
  const directory = await mkdtemp(path.join(os.tmpdir(), 'partcast-demo-'));
  try {
    const input = path.join(directory, 'input.json'), output = path.join(directory, 'result.json');
    await writeFile(input, JSON.stringify(payload), {mode:0o600});
    await new Promise((resolve, reject) => {
      const child = spawn(runtime.python, [script, '--input', input, '--output', output], {stdio:['ignore','pipe','pipe'],env:forecastProcessEnv()});
      let stdout = '', stderr = '', settled = false;
      const finish = (error) => { if (settled) return; settled=true; clearTimeout(timer); error ? reject(error) : resolve(); };
      const timer = setTimeout(() => {child.kill('SIGKILL'); finish(Object.assign(new Error('The demo took too long. Try fewer parts.'),{status:503,safe:true}));}, 150000);
      child.stdout.on('data', data => {stdout = (stdout + data).slice(-4000);});
      child.stderr.on('data', data => {stderr = (stderr + data).slice(-4000);});
      child.on('error', () => finish(Object.assign(new Error('The demo forecasting process could not start.'),{status:503,safe:true})));
      child.on('close', code => finish(code === 0 ? null : code === 2 ? bad(stdout.trim() || 'Check the demo splits and quantities.') : Object.assign(new Error('The demo calculation failed. Check the forecasting engine.'), {status:503,safe:true})));
    });
    const result = JSON.parse(await readFile(output, 'utf8'));
    if (result.dataset_type !== 'SIMULATED_DEMO' || result.actual_sales_modified !== false || result.production_accuracy_established !== false) throw new Error('Invalid demo result.');
    return result;
  } finally {
    await rm(directory, {recursive:true, force:true});
  }
}

export function createDemoJobs({runner=runDemoWorkbook, now=Date.now, ttlMs=30*60*1000}={}) {
  const jobs = new Map();
  let busy = false;
  function prune() {
    for (const [id, job] of jobs) if (job.status !== 'running' && now()-job.updatedAt > ttlMs) jobs.delete(id);
    const completed = [...jobs.values()].filter(job=>job.status !== 'running');
    for (const job of completed.slice(0,Math.max(0,completed.length-8))) jobs.delete(job.id);
  }
  return {
    start(buffer, filename, userId) {
      prune();
      if (busy) throw Object.assign(new Error('Another forecasting demo is running. Try again shortly.'),{status:409,safe:true});
      const id=crypto.randomUUID(), job={id,userId,status:'running',updatedAt:now()};
      jobs.set(id,job);busy=true;
      Promise.resolve().then(()=>runner(buffer,filename)).then(result=>{
        Object.assign(job,{status:'completed',result,updatedAt:now()});
      }).catch(error=>{
        Object.assign(job,{status:'failed',error:error.safe?error.message:'The demo calculation could not finish. Try again or check the forecasting engine.',updatedAt:now()});
      }).finally(()=>{busy=false;});
      return {id,status:job.status};
    },
    get(id,userId) {
      prune();const job=jobs.get(id);
      if (!job || job.userId !== userId) throw Object.assign(new Error('This demo result is unavailable or expired. Run the demo again.'),{status:404,safe:true});
      return {id:job.id,status:job.status,...(job.result?{result:job.result}:{}),...(job.error?{error:job.error}:{})};
    }
  };
}
