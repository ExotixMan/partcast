import {test,expect} from '@playwright/test';
import {partReliability,reliabilityForPart,forecastReliabilityPolicy} from '../../../server/src/utils/forecastReliability.js';
const userId='11111111-1111-4111-8111-111111111111',sessionId='77777777-7777-4777-8777-777777777777',project='ragdjkdcrvexqfadlqbf';
const ids=['33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666'];
const token=`e30.${Buffer.from(JSON.stringify({session_id:sessionId,amr:[{method:'password'}]})).toString('base64url')}.test-only-signature`;
async function fixture(context,{empty=false,race=false,language='en',mobile=false,learned=false,failed=false}={}){
 await context.addInitScript(({token,userId,project,language,mobile})=>{
  localStorage.setItem(`sb-${project}-auth-token`,JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:userId,email:'owner@example.test',aud:'authenticated'}}));
  localStorage.setItem('partcast-language',language);if(mobile){localStorage.setItem('partcast-text-size','large');localStorage.setItem('partcast-theme','dark');}
 },{token,userId,project,language,mobile});
 const products=ids.map((id,i)=>({id,product_id:id,part_number:`PART-${i+1}`,description:['Brake pad','Fuel filter','Engine oil','Old estimate'][i],current_stock:45,unit:'pcs',forecast_days:i===3?0:30,predicted_total:i===3?0:30}));
 let newer=false,lists=0,partReads=0;
 const writes=[];
 function run(){
  const windows=ids.flatMap((product_id,i)=>(i===2?[0]:[0,1]).map(j=>({product_id,origin:j?'2026-07-01':'2026-06-01',start:j?'2026-07-02':'2026-06-02',end:j?'2026-07-31':'2026-07-01',actual_recorded_units:10,predicted_units:i===0?(empty||newer?100:11):i===1?40:10})));
  const actual=windows.reduce((n,w)=>n+w.actual_recorded_units,0),predicted=windows.reduce((n,w)=>n+w.predicted_units,0),absolute=windows.reduce((n,w)=>n+Math.abs(w.predicted_units-w.actual_recorded_units),0);
  return {id:newer?'new-run':'run',horizon_days:30,status:'completed',completed_at:'2026-11-06T00:00:00Z',metrics:{as_of_date:'2026-11-06',daily_values_are_period_averages:!learned,daily_values_follow_learned_pattern:learned,daily_validation:learned?{day_count:210,model:{mae:0.3,rmse:1.2,wape_percent:30},uniform_allocation:{mae:0.8,rmse:1.5}}:null,horizon_validation:{horizon_days:30,status:'no_improvement_over_recent_average',window_count:windows.length,tested_product_count:4,nonzero_window_count:windows.length,model:{mae:absolute/windows.length,wape_percent:Number((absolute/actual*100).toFixed(4)),actual_recorded_units:actual,predicted_units:predicted},recent_average:{mae:1},windows}}};
 }
 await context.route('http://localhost:10000/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,headers={'access-control-allow-origin':'*'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type'}});
  if(req.method()!=='GET')writes.push(path);
  let body={data:[]};
  if(path==='/api/me')body={user:{id:userId,role:'owner',active:true,full_name:'Owner',session_id:sessionId,verification_expires_at:'2099-01-01T00:00:00Z'}};
  else if(path==='/api/offline-snapshot')body={products,suppliers:[]};
  else if(path==='/api/forecast/status')body={ready:true};
  else if(path==='/api/forecast/automation')body={status:'ready',horizon_days:30};
  else if(path==='/api/data-quality')body={actualDemandRows:100};
  else if(path==='/api/forecast/runs')body={data:[...(failed?[{id:'failed',status:'failed',horizon_days:90,training_rows:731,product_count:27,started_at:'2026-11-07T00:01:00+08:00',error_message:'fixture-secret-token',metrics:{failure:{code:'FORECAST_TIMEOUT',stage:'training',elapsed_seconds:120}}},{id:'legacy-failed',status:'failed',horizon_days:90,error_message:'fixture-secret-token'}]:[]),run()]};
  else if(path==='/api/forecast/products'){
   lists++;const current=run(),assessments=partReliability(current.metrics,current.horizon_days);
   body={run:current,reliability_policy:forecastReliabilityPolicy,data:products.map(p=>({...p,reliability:reliabilityForPart(assessments,p.id)}))};
  }else if(path.startsWith('/api/forecast/product/')){
   partReads++;if(race)newer=true;
   const current=run(),product=products.find(p=>p.id===path.split('/').at(-1));
   body={product,run:current,today:'2026-11-06',actualSales:[],reliability:reliabilityForPart(partReliability(current.metrics,30),product.id),reliability_policy:forecastReliabilityPolicy,data:product.forecast_days?Array.from({length:30},(_,i)=>({run_id:current.id,forecast_date:new Date(Date.parse('2026-11-06')+(i+1)*86400000).toISOString().slice(0,10),predicted_quantity:learned?(i%2===0?1.5:.5):1})):[]};
  }
  return route.fulfill({headers,json:body});
 });
 return {writes,getLists:()=>lists,getPartReads:()=>partReads};
}

test('planning keeps the error rule behind the scenes and preserves the full test results',async({page,context})=>{
 const api=await fixture(context);await page.goto('/forecast');
 const choice=page.getByLabel('Choose a part',{exact:true});
 await expect(choice.locator('option')).toHaveCount(2);
 await expect(choice.locator('option').filter({hasText:'Brake pad'})).toHaveCount(1);
 await expect(choice.locator('option').filter({hasText:'Fuel filter'})).toHaveCount(0);
 await expect(choice.locator('option').filter({hasText:'Engine oil'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Summary/})).toHaveCount(0);
 await expect(page.getByRole('region',{name:'Forecast review status'})).toHaveCount(0);
 await expect(page.getByText('Lower historical error',{exact:true})).toHaveCount(0);
 await expect(page.getByText(/Lower-error view: WAPE/)).toHaveCount(0);
 await expect(page.getByRole('img',{name:/Estimated daily sales for Brake pad/})).toBeVisible();
 const search=page.getByRole('combobox',{name:'Search by part number or name',exact:true});await search.fill('Fuel');
 await expect(page.getByRole('option').filter({hasText:'Fuel filter'})).toHaveCount(0);await search.fill('');
 await page.getByRole('button',{name:'Daily list',exact:true}).click();
 await expect(page.getByRole('table').filter({hasText:'Estimated units sold'}).getByRole('row')).toHaveCount(31);
 await page.getByText('Sales data and update history',{exact:true}).click();
 await expect(page.getByRole('region',{name:'How dependable is this estimate?',exact:true}).getByText('88.5714%',{exact:true})).toBeVisible();
 await expect(page.getByText('These overall results include all tested parts, including those outside the planning list.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Chart',exact:true}).click();
 await page.screenshot({path:'/tmp/partcast-planning-simplified-desktop.png',fullPage:true});
 expect(api.writes).toEqual([]);
});

test('no qualifying forecasts explains the condition without exposing weak estimates or removed controls',async({page,context})=>{
 await fixture(context,{empty:true});await page.goto('/forecast');
 await expect(page.getByRole('heading',{name:'No estimates ready for planning'})).toBeVisible();
 await expect(page.getByRole('img',{name:/Estimated daily sales for/})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Summary/})).toHaveCount(0);
 await page.getByText('Sales data and update history',{exact:true}).click();
 await expect(page.getByRole('region',{name:'How dependable is this estimate?',exact:true})).toBeVisible();
});

test('a new higher-error run cannot expose its forecast under an older qualifying list',async({page,context})=>{
 const api=await fixture(context,{race:true});await page.goto('/forecast');
 await expect(page.getByRole('heading',{name:'No estimates ready for planning'})).toBeVisible();
 await expect(page.getByRole('img',{name:/Estimated daily sales for/})).toHaveCount(0);
 expect(api.getLists()).toBeGreaterThan(1);expect(api.getPartReads()).toBeLessThan(6);
 expect(api.writes).toEqual([]);
});

test('the simplified planning page fits a large-text Tagalog dark phone',async({page,context})=>{
 await fixture(context,{language:'fil',mobile:true});await page.setViewportSize({width:320,height:740});await page.goto('/forecast');
 await expect(page.locator('#forecast-part-choice').locator('option')).toHaveCount(2);
 await expect(page.locator('.panel-header').getByRole('group').getByRole('button')).toHaveCount(2);
 await expect(page.getByRole('button',{name:/Buod/})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/partcast-planning-simplified-phone.png',fullPage:true});
});


test('learned daily profiles keep period errors labelled correctly and disclose daily timing errors separately',async({page,context})=>{
 await fixture(context,{learned:true});await page.goto('/forecast');
 await page.getByRole('button',{name:'Daily list',exact:true}).click();
 const table=page.getByRole('table').filter({hasText:'Estimated units sold'});
 await expect(table.getByRole('row').nth(1)).toContainText('1.5');
 await expect(table.getByRole('row').nth(2)).toContainText('0.5');
 await page.getByText('Sales data and update history',{exact:true}).click();
 await expect(page.getByText('These errors compare complete 30-day estimates with recorded sales. They are not accuracy percentages.',{exact:true})).toBeVisible();
 await expect(page.getByText(/The next-day average error was/)).toHaveCount(0);
 await expect(page.getByText('Daily estimates follow patterns learned from past sales while preserving the period total. They are expected quantities, not guaranteed transactions.',{exact:true})).toBeVisible();
 await page.getByText('30-day historical test results',{exact:true}).click();
 await expect(page.getByText('Daily timing test',{exact:true})).toBeVisible();
 await expect(page.getByText('Daily average error (MAE)',{exact:true}).locator('..')).toContainText('0.3 units');
 await expect(page.getByText('Uniform allocation MAE / RMSE',{exact:true}).locator('..')).toContainText('0.8 / 1.5 units');
 await expect(page.getByText('Daily quantity error (WAPE)',{exact:true}).locator('..')).toContainText('30%');
 await page.screenshot({path:'/tmp/partcast-planning-daily-validation.png',fullPage:true});
});


test('failed runs show a safe diagnostic reference without presenting failed training as measured accuracy',async({page,context})=>{
 await fixture(context,{failed:true});await page.goto('/forecast');
 await page.getByText('Sales data and update history',{exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'The forecast took too long to finish. Automatic retry is pending.'})).toBeVisible();
 await expect(page.getByText('Reference: FORECAST_TIMEOUT · TRAINING · 120s',{exact:true})).toBeVisible();
 await expect(page.getByText('This update could not finish. Automatic retry is pending.',{exact:true})).toBeVisible();
 await expect(page.getByText('90-day historical test results',{exact:true})).toHaveCount(0);
 await expect(page.getByText('30-day historical test results',{exact:true})).toHaveCount(1);
 await expect(page.getByText('fixture-secret-token',{exact:false})).toHaveCount(0);
 await expect(page.getByRole('img',{name:/Estimated daily sales for Brake pad/})).toBeVisible();
});


test('All parts restores every inventory choice without inventing missing forecasts or bringing back Summary',async({page,context})=>{
 await fixture(context);await page.goto('/forecast');
 const choice=page.getByLabel('Choose a part',{exact:true});await expect(choice.locator('option')).toHaveCount(2);
 await page.getByRole('button',{name:'All parts (4)',exact:true}).click();
 await expect(choice.locator('option')).toHaveCount(5);
 await choice.selectOption(ids[1]);await expect(page.getByRole('img',{name:/Estimated daily sales for Fuel filter/})).toBeVisible();
 await choice.selectOption(ids[2]);await expect(page.getByRole('img',{name:/Estimated daily sales for Engine oil/})).toBeVisible();
 await choice.selectOption(ids[3]);await expect(page.getByText('No current estimate for this part.',{exact:true})).toBeVisible();
 await expect(page.getByRole('img',{name:/Estimated daily sales for/})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Summary',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Lower-error forecasts (1)',exact:true}).click();
 await expect(choice.locator('option')).toHaveCount(2);await expect(page.getByRole('img',{name:/Estimated daily sales for Brake pad/})).toBeVisible();
});
