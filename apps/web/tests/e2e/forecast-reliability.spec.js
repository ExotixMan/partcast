import {test,expect} from '@playwright/test';
import {partReliability,reliabilityForPart,forecastReliabilityPolicy} from '../../../server/src/utils/forecastReliability.js';
const userId='11111111-1111-4111-8111-111111111111',sessionId='77777777-7777-4777-8777-777777777777',project='ragdjkdcrvexqfadlqbf';
const ids=['33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666'];
const token=`e30.${Buffer.from(JSON.stringify({session_id:sessionId,amr:[{method:'password'}]})).toString('base64url')}.test-only-signature`;
async function fixture(context,{empty=false,race=false,language='en',mobile=false}={}){
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
  return {id:newer?'new-run':'run',horizon_days:30,status:'completed',completed_at:'2026-11-06T00:00:00Z',metrics:{as_of_date:'2026-11-06',daily_values_are_period_averages:true,horizon_validation:{horizon_days:30,status:'no_improvement_over_recent_average',window_count:windows.length,tested_product_count:4,nonzero_window_count:windows.length,model:{mae:absolute/windows.length,wape_percent:Number((absolute/actual*100).toFixed(4)),actual_recorded_units:actual,predicted_units:predicted},recent_average:{mae:1},windows}}};
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
  else if(path==='/api/forecast/runs')body={data:[run()]};
  else if(path==='/api/forecast/products'){
   lists++;const current=run(),assessments=partReliability(current.metrics,current.horizon_days);
   body={run:current,reliability_policy:forecastReliabilityPolicy,data:products.map(p=>({...p,reliability:reliabilityForPart(assessments,p.id)}))};
  }else if(path.startsWith('/api/forecast/product/')){
   partReads++;if(race)newer=true;
   const current=run(),product=products.find(p=>p.id===path.split('/').at(-1));
   body={product,run:current,today:'2026-11-06',actualSales:[],reliability:reliabilityForPart(partReliability(current.metrics,30),product.id),reliability_policy:forecastReliabilityPolicy,data:product.forecast_days?Array.from({length:30},(_,i)=>({run_id:current.id,forecast_date:new Date(Date.parse('2026-11-06')+(i+1)*86400000).toISOString().slice(0,10),predicted_quantity:1})):[]};
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
 await expect(page.getByRole('button',{name:/Lower-error forecasts|All parts|Summary/})).toHaveCount(0);
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
 await expect(page.getByRole('button',{name:/View all parts|All parts|Summary/})).toHaveCount(0);
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
 await expect(page.getByRole('button',{name:/Lahat ng piyesa|Mga pagtatayang mas mababa ang error|Buod/})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/partcast-planning-simplified-phone.png',fullPage:true});
});
