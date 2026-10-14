#!/usr/bin/env node
// Standalone, explicitly simulated exercise. No Supabase or app configuration.
import {readFile,writeFile,mkdir,readdir,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import ExcelJS from '../apps/server/node_modules/exceljs/excel.js';
import JSZip from '../apps/server/node_modules/jszip/lib/index.js';
import {loadSpreadsheet} from '../apps/server/src/utils/spreadsheet.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2), allowed=new Set(['--inventory','--catalog','--out','--as-of','--days','--parts','--seed','--python']);
if(args.length%2||args.some((arg,i)=>i%2===0&&!allowed.has(arg)))throw Error('Use --inventory FILE (or --catalog JSON) --out EMPTY_DIRECTORY --as-of YYYY-MM-DD [--days 730 --parts 24 --seed 20261015 --python PATH].');
const options=Object.fromEntries(Array.from({length:args.length/2},(_,i)=>[args[i*2],args[i*2+1]]));
for(const key of ['--out','--as-of'])if(!options[key])throw Error(`${key} is required.`);
if(Boolean(options['--inventory'])===Boolean(options['--catalog']))throw Error('Choose exactly one source: --inventory XLSX or --catalog JSON.');
const source=path.resolve(options['--inventory']||options['--catalog']), out=path.resolve(options['--out']);
if(source===out||source.startsWith(out+path.sep))throw Error('Keep the output directory separate from the source workbook.');
await mkdir(out,{recursive:true,mode:0o700});
if((await readdir(out)).length)throw Error('Use an empty output directory; existing files will not be overwritten.');
const sourceBytes=await readFile(source), sourceHash=createHash('sha256').update(sourceBytes).digest('hex');
let records=[];
if(options['--catalog']){
 const parsed=JSON.parse(sourceBytes.toString('utf8'));
 if(parsed.dataset_type!=='SIMULATED_DEMO'||!Array.isArray(parsed.parts))throw Error('Use the labelled SIMULATED_Catalog_Input.json from the demo package.');
 records=parsed.parts;
}else{
const book=await loadSpreadsheet(sourceBytes,source), inventory=book.worksheets.find(s=>s.name.toLowerCase()==='inventory');
if(!inventory)throw Error('Use an inventory workbook with an Inventory worksheet.');
let headerRow, headers;
for(let i=1;i<=Math.min(inventory.rowCount,30);i++){
 const values=inventory.getRow(i).values.slice(1).map(v=>String(v??'').trim().toLowerCase());
 if(values.includes('part number')&&values.includes('description')){headerRow=i;headers=values;break;}
}
if(!headerRow)throw Error('Inventory needs Part Number and Description headers. The cleaned inventory workbook is supported.');
for(let i=headerRow+1;i<=inventory.rowCount;i++){
 const row=inventory.getRow(i), raw=row.getCell(headers.indexOf('part number')+1).value;
 if(typeof raw!=='string'||!raw.trim()||raw.trim().length<4||!/[0-9]/.test(raw))continue;
 const item={part_number:raw.trim()};
 for(const key of ['description','brand','unit']){
  const col=headers.indexOf(key);item[key]=col<0?'':row.getCell(col+1).text.trim();
 }
 if(item.description)records.push(item);
}
}
const candidates=[options['--python'],process.env.PYTHON_BIN,path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python'),'python3','python'].filter(Boolean);
let python;
for(const command of [...new Set(candidates)]){
 const result=spawnSync(command,['-c','import numpy,pandas,sklearn,xgboost'],{encoding:'utf8',timeout:15000});
 if(result.status===0){python=command;break;}
}
if(!python)throw Error('Install the project Python dependencies first, or provide --python PATH.');
const temp=await mkdtemp(path.join(os.tmpdir(),'partcast-simulated-'));
try{
 const catalogFile=path.join(temp,'catalog.json');
 await writeFile(catalogFile,JSON.stringify({source_sha256:sourceHash,parts:records}),{mode:0o600});
 const commandArgs=[path.join(root,'ml/simulated_demo.py'),'--catalog',catalogFile,'--out',out,'--as-of',options['--as-of']];
 for(const name of ['--days','--parts','--seed'])if(options[name])commandArgs.push(name,options[name]);
 const result=spawnSync(python,commandArgs,{encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024});
 if(result.status!==0)throw Error(result.stderr?.trim()||result.error?.message||'Simulated training failed.');
 console.log(result.stdout.trim());
}finally{await rm(temp,{recursive:true,force:true});}
if(createHash('sha256').update(await readFile(source)).digest('hex')!==sourceHash)throw Error('Source workbook changed during generation.');
const results=JSON.parse(await readFile(path.join(out,'SIMULATED_Results.json'),'utf8'));
const tables=JSON.parse(await readFile(path.join(out,'SIMULATED_Tables.json'),'utf8'));
const guide=await readFile(path.join(root,'docs/SIMULATED_DEMO.md'),'utf8');
await writeFile(path.join(out,'READ_ME_SIMULATED.md'),guide);
const workbook=new ExcelJS.Workbook();workbook.creator='PartCast — SIMULATED DEMO';workbook.subject='Generated demand; existing catalog identities. Not actual sales.';
const sheets={READ_FIRST:[['SIMULATED DATA ONLY','Details'],
 ['Use','Standalone training experiment or isolated demo installation. Keep separate from actual sales.'],
 ['Items','Identifiers and descriptions come from your inventory. Dates, quantities and demand patterns are simulated.'],
 ['Real-store accuracy','Not established by this simulation.'],
 ['Quantity units','Generated counts use a hypothetical catalog base unit. Blank source units remain unspecified; no pack conversions were inferred.'],
 ['Seed',results.seed],['Parts',results.part_count],['Days per part',results.days_per_part],
 ['Held-out planning period',results.evaluation.horizon_days+' days'],
 ['SIMULATED recursive XGBoost WAPE',results.evaluation.model.wape_percent],
 ['SIMULATED direct-period XGBoost WAPE',results.direct_period_evaluation.model.wape_percent],
 ['Development-selected candidate',results.development_selection.selected_candidate??'None'],
 ['Report','Open SIMULATED_Report.html for all profiles and baseline comparisons.']],...tables};
for(const [name,rows]of Object.entries(sheets)){
 const sheet=workbook.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});rows.forEach(row=>sheet.addRow(row));
 sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
 sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF334155'}};
 sheet.columns.forEach((column,i)=>column.width=Math.min(60,Math.max(18,String(rows[0][i]||'').length+3)));
 if(rows.length>1)sheet.autoFilter={from:{row:1,column:1},to:{row:rows.length,column:rows[0].length}};
}
await workbook.xlsx.writeFile(path.join(out,'SIMULATED_PartCast_Demand.xlsx'));
const escape=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const number=v=>v==null?'Undefined':Number(v).toLocaleString('en',{maximumFractionDigits:4});
const metrics=results.evaluation;
const direct=results.direct_period_evaluation;
const tableRows=Object.entries({'Recursive XGBoost':metrics.model,'Direct-period XGBoost':direct.model,'Recent 28-day average':metrics.recent_average,'Croston-SBA':metrics.croston_sba,TSB:metrics.tsb}).map(([name,m])=>`<tr><th>${escape(name)}</th><td>${number(m.mae)}</td><td>${number(m.rmse)}</td><td>${number(m.wape_percent)}${m.wape_percent==null?'':'%'}</td></tr>`).join('');
const profiles=Object.entries(metrics.by_profile).map(([name,r])=>`<tr><th>${escape(name)}</th><td>${r.parts_tested}</td><td>${number(r.model.wape_percent)}${r.model.wape_percent==null?'':'%'}</td><td>${number(direct.by_profile[name].model.wape_percent)}${direct.by_profile[name].model.wape_percent==null?'':'%'}</td><td>${number(r.recent_average.wape_percent)}${r.recent_average.wape_percent==null?'':'%'}</td><td>${number(r.model.actual_recorded_units)}</td></tr>`).join('');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PartCast — SIMULATED forecast experiment</title><style>body{margin:0;background:#f8fafc;color:#172033;font:16px/1.6 system-ui,sans-serif}main{max-width:1050px;margin:auto;padding:24px}h1{font-size:clamp(24px,5vw,36px);line-height:1.2}h2{font-size:22px}section{background:white;border:1px solid #dbe3ed;border-radius:14px;padding:20px;margin:20px 0}.notice{background:#fffbeb;border:2px solid #f5ca68}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:12px;border-bottom:1px solid #e2e8f0;white-space:nowrap}thead{background:#f1f5f9}a{color:#1d4ed8}.muted{color:#475569}li{margin:8px 0}@media print{body{background:white}main{padding:0}section{break-inside:avoid}}</style><main><p class="muted">PartCast training exercise · ${escape(results.as_of_date)}</p><h1>SIMULATED forecast results</h1><section class="notice"><strong>Generated demand, using existing catalog items.</strong><p>Every demand date and quantity in this package is simulated. These results measure this generated scenario. They do not establish forecasting accuracy for the actual store.</p></section><section><h2>What was tested?</h2><p>${results.part_count} existing parts, ${results.days_per_part} simulated days per part, ${results.daily_rows.toLocaleString('en')} daily rows. The final ${metrics.horizon_days} days were held out. Each complete period was predicted using only earlier history, with fixed XGBoost parameters. The direct model learns the full 30-day total; its exported daily rows are an even allocation of that total, not independently trained daily timing.</p><p>Seed: ${results.seed}. Data was generated once using declared assumptions. Neither the seed nor the patterns were searched to reach a target score.</p><p>This is an exploratory simulated comparison: the recursive reference was inspected during development. Test-period labels are excluded from fitting; these previously inspected scenarios do not constitute a new independent accuracy test.</p><p>All zero days are known in this generated calendar. Unknown gaps in actual sales do not provide that same evidence.</p></section><section><h2>SIMULATED planning-period errors</h2><p>Lower error is better. WAPE is percentage error, not an accuracy percentage. MAE and RMSE below are units per part per ${metrics.horizon_days}-day period.</p><div class="scroll"><table><thead><tr><th>Method</th><th>MAE</th><th>RMSE</th><th>WAPE</th></tr></thead><tbody>${tableRows}</tbody></table></div></section><section><h2>Every simulated demand pattern</h2><div class="scroll"><table><thead><tr><th>Generated pattern</th><th>Parts</th><th>Recursive XGBoost WAPE</th><th>Direct-period XGBoost WAPE</th><th>Recent-average WAPE</th><th>Generated units</th></tr></thead><tbody>${profiles}</tbody></table></div><p>Development-period selection: ${escape(results.development_selection.selected_candidate??'None')}. Selection uses only the three earlier development periods; it does not choose from final-period scores.</p><p>A combined score can hide weak performance for intermittent parts. Review each pattern and compare against the simple average.</p></section><section><h2>Use the package</h2><ul><li>Open <a href="SIMULATED_PartCast_Demand.xlsx">the labelled Excel workbook</a> to inspect the catalog and generated data.</li><li><a href="SIMULATED_Results.json">Results JSON</a> includes the assumptions, part mapping and all test periods.</li><li><a href="SIMULATED_Future_Forecasts.csv">Future estimates</a> come from a separate model refitted on all simulated history after evaluation. Those future estimates have no observed outcomes yet.</li><li>Read <a href="READ_ME_SIMULATED.md">the usage guide</a> before running another experiment. Keep the files separate from actual store records.</li></ul></section><p class="muted">No database connection, real sales change, supplier message or deployment was performed.</p></main></html>`;
await writeFile(path.join(out,'SIMULATED_Report.html'),html);
const names=(await readdir(out)).sort(), manifest={dataset_type:'SIMULATED_DEMO',files:{}};
for(const name of names)manifest.files[name]=createHash('sha256').update(await readFile(path.join(out,name))).digest('hex');
await writeFile(path.join(out,'SIMULATED_Manifest.json'),JSON.stringify(manifest,null,2));
const zip=new JSZip();
for(const name of [...names,'SIMULATED_Manifest.json'])zip.file('SIMULATED_PartCast_Demo/'+name,await readFile(path.join(out,name)));
await writeFile(path.join(out,'SIMULATED_PartCast_Demo.zip'),await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
console.log(JSON.stringify({workbook:'SIMULATED_PartCast_Demand.xlsx',report:'SIMULATED_Report.html',bundle:'SIMULATED_PartCast_Demo.zip',source_workbook_unchanged:true}));
