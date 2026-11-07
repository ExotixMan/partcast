import {test,expect} from '@playwright/test';
test.use({locale:'de-DE'});
const user='11111111-1111-4111-8111-111111111111',session='77777777-7777-4777-8777-777777777777',part='33333333-3333-4333-8333-333333333333',empty='44444444-4444-4444-8444-444444444444';
const token=`e30.${Buffer.from(JSON.stringify({session_id:session,amr:[{method:'password'}]})).toString('base64url')}.fixture`;

async function fixture(context){
 await context.addInitScript(({user,token})=>{
  localStorage.setItem('sb-ragdjkdcrvexqfadlqbf-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:user,email:'owner@example.test',aud:'authenticated'}}));
  localStorage.setItem('partcast-language','en');
 },{user,token});
 const products=[{id:part,product_id:part,part_number:'TEST-001',description:'Fixture filter',current_stock:2,forecast_days:14,predicted_total:39.728,unit:'pc',category:'parts',selling_price:100,unit_cost:60,minimum_stock:1,safety_stock:1,photo_paths:[],search_aliases:[],stock_status:'ok'},
 {id:empty,product_id:empty,part_number:'TEST-002',description:'Fixture without history',current_stock:0,forecast_days:0,predicted_total:0,unit:'pc',category:'parts',photo_paths:[],search_aliases:[],stock_status:'out'}];
 const validation={horizon_days:14,status:'no_improvement_over_recent_average',window_count:209,tested_product_count:10,nonzero_window_count:209,model:{mae:4.4703,rmse:7,r2:.7,wape_percent:26.7934,actual_recorded_units:3487,predicted_units:3068.006},recent_average:{mae:4}};
 const run={id:'fixture-run',status:'completed',horizon_days:14,started_at:'2026-11-06T16:01:00Z',completed_at:'2026-11-06T16:02:00Z',metrics:{daily_values_follow_learned_pattern:true,horizon_validation:validation}};
 let total=9;const writes=[];
 await context.route('http://localhost:10000/**',async route=>{
  const request=route.request(),url=new URL(request.url()),headers={'access-control-allow-origin':'*'};
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type'}});
  if(request.method()!=='GET')writes.push(url.pathname);
  let body={data:[]};
  if(url.pathname==='/api/me')body={user:{id:user,role:'owner',active:true,session_id:session,full_name:'Owner',verification_expires_at:'2099-01-01T00:00:00Z'}};
  else if(url.pathname==='/api/offline-snapshot')body={products,suppliers:[]};
  else if(url.pathname==='/api/products')body={data:products,count:products.length};
  else if(url.pathname==='/api/forecast/status')body={ready:true};
  else if(url.pathname==='/api/forecast/automation')body={status:'ready',horizon_days:14,last_run_id:run.id};
  else if(url.pathname==='/api/data-quality')body={actualDemandRows:3};
  else if(url.pathname==='/api/forecast/runs')body={data:[run]};
  else if(url.pathname==='/api/forecast/products')body={run,data:products};
  else if(url.pathname.startsWith('/api/forecast/product/')){
   const product=products.find(p=>p.id===url.pathname.split('/').at(-1));
   body={product,run,today:'2026-11-07',actualSales:[],data:product.id===part?Array.from({length:14},(_,i)=>({run_id:run.id,forecast_date:new Date(Date.parse('2026-11-07T00:00:00Z')+(i+1)*86400000).toISOString().slice(0,10),predicted_quantity:i<2?2.8378:2.8377})):[]};
  }else if(url.pathname==='/api/forecast/recorded-sales')body={mode:'recorded_sales',record_count:3,part_count:1,last_sale_date:'2026-11-06',data:[{product_id:part,part_number:'TEST-001',description:'Fixture filter',recorded_quantity:total,sale_days:2,actual_records:2,imported_records:1,first_sale_date:'2026-11-05',last_sale_date:'2026-11-06',unit:'pc'}]};
  return route.fulfill({headers,json:body});
 });
 return {writes,setTotal(value){total=value;}};
}

test('90 days is absent and the summary shows bounded stock coverage using the selected run',async({page,context})=>{
 const api=await fixture(context);await page.goto('/forecast');
 const horizon=page.getByLabel('Planning period',{exact:true});
 await expect(horizon.locator('option')).toHaveCount(3);
 await expect(horizon.locator('option[value="90"]')).toHaveCount(0);
 await page.getByRole('button',{name:'Summary',exact:true}).click();
 const summary=page.getByRole('article',{name:'Demand forecast summary'});
 await expect(summary).toContainText('39.7');await expect(summary).toContainText('Estimated shortfall');
 const coverage=summary.getByRole('progressbar',{name:'Stock coverage',exact:true});
 await expect(coverage).toHaveAttribute('aria-valuenow','5');
 await expect(summary.getByText('Expected stock consumption',{exact:true})).toHaveCount(0);
 await page.getByLabel('Choose a part',{exact:true}).selectOption(empty);
 await expect(page.getByText('No demand estimate is available for this part yet.',{exact:true})).toBeVisible();
 expect(api.writes).toEqual([]);
});

test('historical metrics keep Philippine number formatting even with a different browser locale',async({page,context})=>{
 await fixture(context);await page.goto('/forecast');await page.getByText('Sales data and update history',{exact:true}).click();
 const metrics=page.getByRole('region',{name:'How dependable is this estimate?',exact:true});
 await expect(metrics.getByText('Average forecast error per planning period (MAE)',{exact:true})).toBeVisible();
 await expect(metrics.getByText('Recorded / forecast units in historical tests',{exact:true})).toBeVisible();
 await expect(metrics).toContainText('4.4703');await expect(metrics).toContainText('26.7934%');await expect(metrics).toContainText('3,487 / 3,068.006');
 await expect(metrics.getByText(/next-day average error/)).toHaveCount(0);
});

test('sales use Total sold and Recorded transactions and refresh after another tab saves sales',async({page,context})=>{
 const api=await fixture(context);await page.goto('/sales');
 const summary=page.getByRole('region',{name:'Sales by part',exact:true});
 await expect(summary.getByRole('columnheader',{name:'Total sold',exact:true})).toBeVisible();
 await expect(summary.getByText('Recorded transactions: 2 · Imported records: 1',{exact:true}).last()).toBeVisible();
 await expect(summary.getByRole('row').filter({hasText:'TEST-001'})).toContainText('9 pc');
 api.setTotal(12);
 const other=await context.newPage();await other.goto('/inventory');
 await other.evaluate(({user})=>{const channel=new BroadcastChannel(`partcast-data:${user}`);channel.postMessage(['demand_observations']);channel.close();},{user});
 await expect(summary.getByRole('row').filter({hasText:'TEST-001'})).toContainText('12 pc');
 await page.getByRole('link',{name:'Recorded transactions',exact:true}).click();
 await expect(page.getByRole('region',{name:'Recorded transactions',exact:true})).toBeVisible();
});

test('inventory separates opening quantities from increases and reductions used for stock corrections',async({page,context})=>{
 const api=await fixture(context);await page.goto('/inventory');
 await page.getByRole('button',{name:'Add a new part',exact:true}).click();
 let dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Opening stock quantity *',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Adjust stock',exact:true}).first().click();dialog=page.getByRole('dialog');
 const direction=dialog.getByRole('combobox',{name:'What needs correcting?'});
 await expect(direction.locator('option')).toHaveText(['Reduce stock count','Increase stock count']);
 await dialog.getByLabel('Reason for correction *',{exact:true}).fill(' ');
 await dialog.getByRole('button',{name:'Confirm correction',exact:true}).click();
 await expect(dialog.getByText('Enter a reason for this stock correction.',{exact:true})).toBeVisible();
 expect(api.writes).toEqual([]);
});
