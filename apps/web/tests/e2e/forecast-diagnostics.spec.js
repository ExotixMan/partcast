import {test,expect} from '@playwright/test';
const user='11111111-1111-4111-8111-111111111111',session='77777777-7777-4777-8777-777777777777',part='33333333-3333-4333-8333-333333333333';
const token=`e30.${Buffer.from(JSON.stringify({session_id:session,amr:[{method:'password'}]})).toString('base64url')}.fixture`;

for(const nested of [false,true])test(`daily timing diagnostics stay hidden and ${nested?'legacy':'saved'} period R² is shown`,async({page,context})=>{
 await context.addInitScript(({user,token})=>{
  localStorage.setItem('sb-ragdjkdcrvexqfadlqbf-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:user,email:'owner@example.test',aud:'authenticated'}}));
  localStorage.setItem('partcast-language','en');
 },{user,token});
 const product={id:part,product_id:part,part_number:'TEST-001',description:'Fixture filter',current_stock:2,forecast_days:30,predicted_total:6,unit:'pc'};
 const daily={day_count:450,model:{mae:.3141,rmse:2.1826,wape_percent:63.4079},uniform_allocation:{mae:.855,rmse:2.1033}};
 const validation={horizon_days:30,status:'improvement_observed',window_count:15,tested_product_count:1,nonzero_window_count:15,model:{mae:4.4,rmse:6.2,r2:.8,wape_percent:10,actual_recorded_units:100,predicted_units:90},recent_average:{mae:5},...(nested?{daily_validation:daily}:{})};
 const run={id:'fixture-run',status:'completed',horizon_days:30,training_rows:735,product_count:14,started_at:'2026-11-07T07:00:00Z',completed_at:'2026-11-07T07:01:00Z',metrics:{daily_values_follow_learned_pattern:true,horizon_validation:validation,...(!nested?{daily_validation:daily}:{})}};
 if(nested){
  delete validation.model.r2;
  validation.window_count=2;
  validation.windows=[{actual_recorded_units:10,predicted_units:12},{actual_recorded_units:20,predicted_units:18}];
  run.metrics.r2=.1234;
 }
 const writes=[];
 await context.route('http://localhost:10000/**',async route=>{
  const request=route.request(),url=new URL(request.url()),headers={'access-control-allow-origin':'*'};
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type'}});
  if(request.method()!=='GET')writes.push(url.pathname);
  let body={data:[]};
  if(url.pathname==='/api/me')body={user:{id:user,role:'owner',active:true,session_id:session,full_name:'Owner',verification_expires_at:'2099-01-01T00:00:00Z'}};
  else if(url.pathname==='/api/offline-snapshot')body={products:[product],suppliers:[]};
  else if(url.pathname==='/api/forecast/status')body={ready:true};
  else if(url.pathname==='/api/forecast/automation')body={status:'ready',horizon_days:30,last_run_id:run.id};
  else if(url.pathname==='/api/forecast/runs')body={data:[run]};
  else if(url.pathname==='/api/data-quality')body={actualDemandRows:34,importedTrainingRows:701};
  else if(url.pathname==='/api/forecast/products')body={run,data:[product]};
  else if(url.pathname.startsWith('/api/forecast/product/'))body={product,run,today:'2026-11-07',actualSales:[],data:[{run_id:run.id,forecast_date:'2026-11-08',predicted_quantity:.2}]};
  return route.fulfill({headers,json:body});
 });
 await page.goto('/forecast');
 await page.getByRole('button',{name:/^All parts/}).click();
 const chart=page.getByRole('img',{name:/Estimated daily sales for/});await expect(chart).toBeVisible();
 await expect(chart.locator('.recharts-line')).toHaveCount(3);
 await expect(chart.locator('.recharts-legend-wrapper')).toContainText('Projected stock');
 await chart.locator('.recharts-line-dot[stroke="#059669"]').last().hover({force:true});
 await expect(chart.locator('.recharts-tooltip-wrapper')).toContainText('Projected stock');
 await expect(chart.locator('.recharts-tooltip-wrapper')).toContainText('1.8');
 await page.getByText('Sales data and update history',{exact:true}).click();
 const heading=page.getByText('30-day historical test results',{exact:true});await heading.click();
 const details=heading.locator('..');
 await expect(details.getByText('Average error (MAE)',{exact:true})).toBeVisible();
 await expect(details.getByText('Overall error (WAPE)',{exact:true})).toBeVisible();
 await expect(details.getByText('Larger-error measure (RMSE)',{exact:true})).toBeVisible();
 await expect(details.getByText('Fit score (R²)',{exact:true})).toBeVisible();
 await expect(details.getByText(nested?'0.84':'0.8',{exact:true})).toBeVisible();
 await expect(details.getByText('0.1234',{exact:true})).toHaveCount(0);
 await expect(details).toContainText('4.4');await expect(details).toContainText('10%');
 for(const text of ['Daily timing test','Daily average error (MAE)','Daily larger-error measure (RMSE)','Daily quantity error (WAPE)','Uniform allocation MAE / RMSE'])await expect(page.getByText(text,{exact:true})).toHaveCount(0);
 await expect(page.getByText(/Compared 450 part-days/)).toHaveCount(0);
 expect(writes).toEqual([]);
});
