import {test,expect} from '@playwright/test';
const userId='11111111-1111-4111-8111-111111111111';
const productId='33333333-3333-4333-8333-333333333333';
const sid='77777777-7777-4777-8777-777777777777';
const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({session_id:sid,amr:[{method:'password'}]})).toString('base64url')+'.test-only-signature';
const project='ragdjkdcrvexqfadlqbf';
async function setup(context,{role='inventory_staff'}={}){
 let stock=5,requests=[],receipts=new Set(),disconnected=false;
 await context.addInitScript(({userId,project,token})=>{
  if(!localStorage.getItem(`sb-${project}-auth-token`))localStorage.setItem(`sb-${project}-auth-token`,JSON.stringify({access_token:token,refresh_token:'test-only-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:userId,email:'staff@example.test',aud:'authenticated'}}));
 },{userId,project,token});
 const product=()=>({id:productId,part_number:'BP-001',description:'Toyota brake pad',brand:'Toyota',unit:'pcs',location:'Shelf A',current_stock:stock,minimum_stock:2,selling_price:500,stock_status:stock<=0?'out':stock<=2?'low':'ok'});
 await context.route('http://localhost:10000/**',async route=>{
  if(disconnected){await route.abort('internetdisconnected');return;}
  const req=route.request(),url=new URL(req.url());let body;
  if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PATCH,OPTIONS','access-control-allow-headers':'authorization,content-type'}});return;}
  if(url.pathname==='/api/me')body={user:{id:userId,full_name:'Store Staff',role,active:true,session_id:sid,verification_expires_at:'2099-01-01T00:00:00Z'}};
  else if(url.pathname==='/api/offline-snapshot')body={products:[product()],suppliers:[]};
  else if(url.pathname==='/api/products')body={data:[product()],count:1};
  else if(url.pathname==='/api/suppliers'||url.pathname==='/api/notifications')body={data:[]};
  else if(url.pathname==='/api/dashboard')body={metrics:{totalProducts:1,lowStock:0,outOfStock:0,inventoryValue:1000},salesTrend:[],fastMoving:[],slowMoving:[],reorder:[],latestForecastRun:null};
  else if(url.pathname==='/api/inventory/movement'||url.pathname==='/api/inventory/batch'){
   const payload=req.postDataJSON();requests.push(payload);
   if(!receipts.has(payload.client_operation_id)){stock+=(payload.tx_type==='stock_in'?1:-1)*Number(payload.lines?.[0].quantity??payload.quantity);receipts.add(payload.client_operation_id);}
   body={transactionId:'test-transaction'};
  }else body={data:[],needsSetup:false};
  await route.fulfill({json:body,headers:{'access-control-allow-origin':'*'}});
 });
 return {requests,getStock:()=>stock,setDisconnected:value=>{disconnected=value;}};
}
test('mobile: saved inventory survives offline reload, queued sale sends on reconnection',async({page,context})=>{
 await page.setViewportSize({width:390,height:844});
 const backend=await setup(context);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/inventory');
 await expect(page.getByRole('article').getByText('Toyota brake pad',{exact:true})).toBeVisible();
 await expect(page.getByText(/Inventory saved/)).toBeVisible();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await page.reload();
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 backend.setDisconnected(true);
 await context.setOffline(true);
 await expect(page.getByText('Working offline',{exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('article').getByText('Toyota brake pad',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Open Store Assistant'}).click();
 await page.getByRole('textbox',{name:'Message to Store Assistant'}).fill('How do I record a sale?');
 await page.getByRole('button',{name:'Send message'}).click();
 await expect(page.getByText(/Open Sell or receive and choose Sell parts/)).toBeVisible();
 await page.getByRole('button',{name:'Close Store Assistant'}).click();
 await page.getByRole('navigation',{name:'Quick navigation'}).getByRole('link',{name:'Sell or receive',exact:true}).click();
 await page.getByRole('button',{name:'Add Toyota brake pad to basket'}).click();
 await page.getByLabel('Quantity',{exact:true}).fill('2');
 await expect(page.getByText('Stock after this sale: 3 pcs')).toBeVisible();
 await page.getByRole('button',{name:'3. Confirm sale'}).click();
 await expect(page.getByText(/1 unsent transaction/)).toBeVisible();
 expect(backend.requests.length).toBe(0);
 await page.reload();
 await expect(page.getByText(/1 unsent transaction/)).toBeVisible();
 backend.setDisconnected(false);
 await context.setOffline(false);
 await expect.poll(()=>backend.requests.length,{timeout:15000}).toBe(1);
 await expect(page.getByText('Connected',{exact:true})).toBeVisible();
 expect(backend.getStock()).toBe(3);
 await page.setViewportSize({width:820,height:1180});
 await expect(page.getByRole('button',{name:'Send changes'})).toBeHidden();
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect(page.getByText('Connected',{exact:true})).toBeVisible();
 expect(backend.requests.length).toBe(1);
 expect(errors).toEqual([]);
 await page.screenshot({path:'/tmp/partcast-mobile.png',fullPage:true});
});
for(const size of [{name:'tablet',width:820,height:1180},{name:'desktop',width:1440,height:1000}]){
 test(`${size.name}: overview, navigation and chatbot use clear actions without overflow`,async({page,context})=>{
  await setup(context);await page.setViewportSize(size);await page.goto('/');
  await expect(page.getByRole('heading',{name:'Hello, Store'})).toBeVisible();
  await page.getByRole('link',{name:/Record a sale/}).click();
  await expect(page.getByRole('heading',{name:'Sell or receive',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Open Store Assistant'}).click();
  await page.getByRole('textbox',{name:'Message to Store Assistant'}).fill('How do I record a sale?');
  await page.getByRole('button',{name:'Send message'}).click();
  await expect(page.getByText(/Open Sell or receive and choose Sell parts/)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`/tmp/partcast-${size.name}.png`,fullPage:true});
 });
}
test('sign out deletes account cache; next account cannot read it',async({page,context})=>{
 await setup(context);await page.goto('/inventory');await expect(page.getByText(/Inventory saved/)).toBeVisible();
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Sign in',exact:true})).toBeVisible();
 const entries=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('partcast-offline-v1');r.onsuccess=()=>{const req=r.result.transaction('cache').objectStore('cache').getAll();req.onsuccess=()=>resolve(req.result);};}));
 expect(entries).toEqual([]);
});

test('sign-in connection failures show a retry action and release the submit button',async({page,context})=>{
 let serverAvailable=false;
 await context.route('http://localhost:10000/**',async route=>{
  if(!serverAvailable){await route.abort('failed');return;}
  await route.fulfill({json:{needsSetup:false},headers:{'access-control-allow-origin':'*'}});
 });
 await context.route(`https://${project}.supabase.co/**`,route=>route.abort('failed'));
 await page.goto('/');
 await expect(page.getByText(/Cannot reach the store server/)).toBeVisible();
 serverAvailable=true;
 await page.getByRole('button',{name:'Check connection again'}).click();
 await expect(page.getByText(/Cannot reach the store server/)).toHaveCount(0);
 await page.getByLabel('Email address').fill('staff@example.test');
 await page.getByLabel('Password',{exact:true}).fill('test-only-password');
 await page.getByRole('button',{name:'Continue'}).click();
 await expect(page.getByText(/Cannot reach the sign-in service/)).toBeVisible({timeout:20000});
 await expect(page.getByRole('button',{name:'Continue'})).toBeEnabled();
});

test('reports download Excel and reject an HTML page returned by a misconfigured API',async({page,context})=>{
 await setup(context);
 let wrongServer=false;
 await context.route('http://localhost:10000/api/reports/inventory.xlsx**',async route=>{
  await route.fulfill({contentType:wrongServer?'text/html':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',body:wrongServer?'<html>Website page</html>':'test-only-report',headers:{'access-control-allow-origin':'*'}});
 });
 await page.goto('/reports');
 const inventory=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Inventory report'})});
 const downloading=page.waitForEvent('download');
 await inventory.getByRole('button',{name:'Download Excel'}).click();
 expect((await downloading).suggestedFilename()).toBe('inventory.xlsx');
 wrongServer=true;
 await inventory.getByRole('button',{name:'Download Excel'}).click();
 await expect(page.getByText(/unexpected information/i)).toBeVisible();
});

test('home search and stock shortcuts carry the selected task to Inventory on a small phone',async({page,context})=>{
 await setup(context);await page.setViewportSize({width:320,height:740});await page.goto('/');
 await page.getByLabel('Find a part',{exact:true}).fill('BP-001');
 await page.getByRole('button',{name:'Find',exact:true}).click();
 await expect(page).toHaveURL(/inventory\?q=BP-001/);
 await expect(page.getByRole('combobox',{name:'Search inventory'})).toHaveValue('BP-001');
 await expect(page.getByRole('article').getByText('Toyota brake pad',{exact:true})).toBeVisible();
 await page.getByRole('navigation',{name:'Quick navigation'}).getByRole('link',{name:'Home',exact:true}).click();
 await page.getByRole('link',{name:/Running low/}).click();
 await expect(page.getByRole('button',{name:'Running low',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('sale basket keeps typing focus, rejects excessive or imprecise quantities, and saves a valid sale',async({page,context})=>{
 const backend=await setup(context);await page.setViewportSize({width:390,height:844});await page.goto('/inventory?action=sale');
 await expect(page).toHaveURL(/counter/);await expect(page.getByText(/Inventory saved/)).toBeVisible();
 await page.getByRole('button',{name:'Add Toyota brake pad to basket'}).click();
 const quantity=page.getByLabel('Quantity',{exact:true}),price=page.getByLabel('Price per unit',{exact:true});
 await quantity.fill('6');await expect(quantity).toBeFocused();await page.getByRole('button',{name:'3. Confirm sale'}).click();
 await expect(page.getByRole('alert')).toContainText('not enough saved stock');expect(backend.requests).toHaveLength(0);
 await quantity.fill('0.005');await expect(page.getByRole('button',{name:'3. Confirm sale'})).toBeDisabled();await expect(page.getByText('Enter a whole-number quantity of 1 or more.')).toBeVisible();expect(backend.requests).toHaveLength(0);
 await quantity.fill('2');await price.fill('-1');await expect(page.getByRole('button',{name:'3. Confirm sale'})).toBeDisabled();await expect(price).toHaveAttribute('aria-invalid','true');await expect(page.getByText('Add a selling price for every part to continue.')).toBeVisible();
 await price.fill('500');await expect(price).toBeFocused();await expect(page.getByText('Stock after this sale: 3 pcs')).toBeVisible();
 await page.getByRole('button',{name:'3. Confirm sale'}).click();await expect.poll(()=>backend.requests.length).toBe(1);expect(backend.getStock()).toBe(3);
});

test('inventory offers only part editing and validated stock corrections',async({page,context})=>{
 const backend=await setup(context);await page.setViewportSize({width:390,height:844});await page.goto('/inventory');await expect(page.getByText(/Inventory saved/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Sell',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Receive',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Adjust stock'}).filter({visible:true}).click();await page.getByRole('button',{name:'Confirm correction'}).click();await expect(page.getByLabel('Reason for correction *')).toHaveAttribute('aria-invalid','true');expect(backend.requests).toHaveLength(0);
 await page.getByLabel('Reason for correction *').fill('Damaged part');await page.getByLabel('Quantity *').fill('6');await page.getByRole('button',{name:'Confirm correction'}).click();await expect(page.getByLabel('Quantity *')).toHaveAttribute('aria-invalid','true');
 await page.getByLabel('Quantity *').fill('1');await page.getByRole('button',{name:'Confirm correction'}).click();await expect.poll(()=>backend.requests.length).toBe(1);expect(backend.getStock()).toBe(4);expect(backend.requests[0].tx_type).toBe('stock_out');
});

test('adding a part explains missing required information without submitting',async({page,context})=>{
 await setup(context);await page.goto('/inventory');
 await page.getByRole('button',{name:'Add a new part'}).click();
 await page.getByRole('button',{name:'Save part',exact:true}).click();
 const name=page.getByLabel('Part name *');await expect(name).toHaveAttribute('aria-invalid','true');await expect(name).toBeFocused();
 await expect(page.getByText(/Enter a part name with at least 2 characters/)).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Add a new part'})).toBeFocused();
});

test('navigation and help trap keyboard focus and return it when closed',async({page,context})=>{
 await setup(context);await page.setViewportSize({width:390,height:844});await page.goto('/');
 const more=page.getByRole('button',{name:'More pages'});await more.click();
 await expect(page.getByRole('button',{name:'Close navigation'})).toBeFocused();
 await page.keyboard.press('Shift+Tab');await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');await expect(more).toBeFocused();
 const help=page.getByRole('button',{name:'Open Store Assistant'});await help.click();
 await expect(page.getByRole('button',{name:'Close Store Assistant'})).toBeFocused();
 await page.keyboard.press('Shift+Tab');await expect(page.getByRole('textbox',{name:'Message to Store Assistant'})).toBeFocused();
 await page.getByRole('button',{name:'How do I receive a delivery?'}).click();
 await expect(page.getByText(/Open Sell or receive and choose Receive delivery/)).toBeVisible();
 expect(await page.locator('#root').evaluate(el=>el.inert)).toBe(true);
 await page.keyboard.press('Escape');await expect(help).toBeFocused();
 expect(await page.locator('#root').evaluate(el=>el.inert)).toBe(false);
});

test('light sign-in supports password visibility on a phone',async({page,context})=>{
 await context.route('http://localhost:10000/**',route=>route.fulfill({json:{needsSetup:false},headers:{'access-control-allow-origin':'*'}}));
 await context.route(`https://${project}.supabase.co/**`,route=>route.abort('failed'));
 await page.setViewportSize({width:320,height:740});await page.goto('/login');
 const password=page.getByLabel('Password',{exact:true});await password.fill('test-only-password');
 await page.getByRole('button',{name:'Show password',exact:true}).click();await expect(password).toHaveAttribute('type','text');
 await page.getByRole('button',{name:'Hide password',exact:true}).click();await expect(password).toHaveAttribute('type','password');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await password.fill('');
 await password.blur();
 for(const [name,width,height] of [['phone',320,840],['tablet',820,1180],['desktop',1440,1000]]){
  await page.setViewportSize({width,height});
  await expect(page.getByRole('heading',{name:'Sign in',exact:true})).toBeVisible();
  await expect(page.getByRole('list',{name:'Sign-in steps'}).locator('[aria-current="step"]')).toHaveText('1. Password');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('.login-page').evaluate(el=>[el,...el.querySelectorAll('*')].some(node=>getComputedStyle(node).backgroundImage.includes('gradient')))).toBe(false);
  await page.screenshot({path:`/tmp/partcast-login-${name}.png`,fullPage:true});
 }
 await page.setViewportSize({width:320,height:840});await page.getByRole('button',{name:'Text and display'}).click();await page.getByRole('button',{name:'Larger text',exact:true}).click();await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByLabel('Website language').selectOption('fil');await expect(page.getByRole('heading',{name:'Mag-sign in',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Susunod',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/partcast-login-tagalog.png',fullPage:true});
 await page.getByRole('button',{name:'Laki ng text at kulay'}).click();await page.getByRole('button',{name:'Gamitin ang dark mode'}).click();await page.getByRole('button',{name:'Tapos na',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for(const size of [{name:'small-phone',width:320,height:740},{name:'tablet',width:820,height:1180},{name:'desktop',width:1440,height:1000}]){
 test(`${size.name}: every staff screen fits and displays meaningful empty states`,async({page,context})=>{
  await setup(context);await page.setViewportSize(size);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const [path,title] of [['/','Hello, Store'],['/inventory','Inventory'],['/transactions','Stock history'],['/reorder','Restock'],['/forecast','Plan ahead'],['/reports','Reports'],['/account','My account']]){
   await page.goto(path);await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
   await expect(page.locator('main').getByRole('status').filter({hasText:/Loading|Opening|Checking|Getting/})).toHaveCount(0);
   if(path==='/inventory')await expect(page.locator('main').getByText('Toyota brake pad',{exact:true}).filter({visible:true})).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${path} overflows`).toBe(true);
   if(path==='/'||path==='/inventory')await page.screenshot({path:`/tmp/partcast-redesign-${size.name}-${path==='/'?'home':'inventory'}.png`,fullPage:true});
  }
  expect(errors).toEqual([]);
 });
}

async function planningData(context,{metrics={}}={}){
 const run={id:'current-run',status:'completed',started_at:'2026-10-09T02:00:00Z',completed_at:'2026-10-09T02:01:00Z',horizon_days:30,training_rows:55,product_count:1,metrics:{mae:0.2,baseline_mae:0.3,coverage_warning:true,stale_product_count:3,...metrics}};
 const headers={'access-control-allow-origin':'*'};
 await context.route('http://localhost:10000/api/forecast/**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{ready:true},headers});
  if(path.endsWith('/readiness'))return route.fulfill({json:{ready:false,status:'no_observations',record_count:0,current_part_count:0,products:[],requirements:{sale_days:5,calendar_days:35,maximum_age_days:31}},headers});
  if(path.endsWith('/recorded-sales'))return route.fulfill({json:{data:[],record_count:0,part_count:0},headers});
  const body=path.endsWith('/runs')?{data:[run]}:path.endsWith('/products')?{run,data:[{product_id:productId,part_number:'BP-001',description:'Toyota brake pad',predicted_total:1.5,forecast_days:2}]}:{data:[{run_id:'older-run',forecast_date:'2026-10-10',predicted_quantity:99},{run_id:run.id,forecast_date:'2026-10-10',predicted_quantity:0.5},{run_id:run.id,forecast_date:'2026-10-11',predicted_quantity:1}]};
  await route.fulfill({json:body,headers});
 });
 await context.route('http://localhost:10000/api/data-quality',route=>route.fulfill({json:{importedTrainingRows:55,actualDemandRows:25},headers}));
 await context.route('http://localhost:10000/api/reorder**',route=>route.fulfill({json:{data:[{product_id:productId,part_number:'BP-001',description:'Toyota brake pad',supplier_id:'supplier-one',supplier_name:'Parts Supplier',supplier_email:'supplier@example.test',current_stock:0,recommended_quantity:5,estimated_order_cost:1000,status:'out_of_stock'}]},headers}));
 await context.route('http://localhost:10000/api/suppliers',route=>route.fulfill({json:{data:[{id:'supplier-one',name:'Parts Supplier',email:'supplier@example.test'}]},headers}));
}

test('planning explains data limits, lists current estimates, and requires review before supplier email',async({page,context})=>{
 await setup(context,{role:'owner'});await planningData(context);await page.setViewportSize({width:390,height:844});
 let sent=0;
 await context.route('http://localhost:10000/api/admin/supplier-email/supplier-one',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  sent++;await route.fulfill({json:{items:1},headers:{'access-control-allow-origin':'*'}});
 });
 await page.goto('/forecast');await expect(page.getByText(/3 parts were left out/)).toBeVisible();
 await page.getByRole('button',{name:'Daily list',exact:true}).click();
 await expect(page.getByRole('table').getByRole('row')).toHaveCount(3);await expect(page.getByRole('table')).not.toContainText('99');
 await page.goto('/reorder');await page.getByRole('button',{name:'Review supplier email'}).click();
 await expect(page.getByRole('dialog')).toContainText('supplier@example.test');expect(sent).toBe(0);
 await page.getByRole('button',{name:'Close',exact:true}).click();expect(sent).toBe(0);
 await page.getByRole('button',{name:'Review supplier email'}).click();
 await page.getByRole('button',{name:'Send email to supplier'}).click();await expect.poll(()=>sent).toBe(1);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('planning shows precise errors and full-period missed demand without presenting an accuracy percentage',async({page,context})=>{
 await setup(context,{role:'owner'});await planningData(context,{metrics:{mae:0.0177,horizon_validation:{horizon_days:30,window_count:6,tested_product_count:2,nonzero_window_count:1,status:'no_improvement_over_zero',model:{mae:9.166,wape_percent:100.0349,actual_recorded_units:110,predicted_units:0.008},recent_average:{mae:15.6548}}}});
 await page.setViewportSize({width:390,height:844});await page.goto('/forecast');
 const accuracy=page.getByRole('region',{name:'How dependable is this estimate?'});
 await expect(accuracy).toContainText('0.0177 units');await expect(accuracy).toContainText('100.0349%');await expect(accuracy).toContainText('110 / 0.008');await expect(accuracy).toContainText('Checked 6 past periods of 30 days across 2 parts');await expect(accuracy).toContainText('not an accuracy percentage');await expect(accuracy).toContainText('did not beat the zero-sales test');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('planning explains untested periods and undefined percentage errors',async({page,context})=>{
 await setup(context,{role:'owner'});await planningData(context);await page.goto('/forecast');
 await expect(page.getByRole('heading',{name:'More sales history is needed'})).toBeVisible();
 await expect(page.getByText('Full-period accuracy is not available.',{exact:false})).toBeVisible();
 await planningData(context,{metrics:{horizon_validation:{horizon_days:90,window_count:1,tested_product_count:1,nonzero_window_count:0,status:'no_recorded_test_demand',model:{mae:2,wape_percent:null,actual_recorded_units:0,predicted_units:2},recent_average:{mae:1}}}});await page.reload();
 const accuracy=page.getByRole('region',{name:'How dependable is this estimate?'});
 await expect(accuracy).toContainText('Not measurable');await expect(accuracy).toContainText('no recorded sales');await expect(accuracy).not.toContainText('NaN');await expect(accuracy).not.toContainText('null%');
});

test('staff planning hides management actions and help retains focus during a delayed reply',async({page,context})=>{
 await setup(context);await planningData(context);await page.setViewportSize({width:390,height:844});
 await page.goto('/forecast');await expect(page.getByRole('heading',{name:'Plan ahead',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Update demand estimate'})).toHaveCount(0);
 await page.goto('/reorder');await expect(page.getByRole('heading',{name:'Restock',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Review supplier email'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Add supplier'})).toHaveCount(0);
 let release;
 await context.route('http://localhost:10000/api/assistant/chat',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  await new Promise(resolve=>{release=resolve;});
  await route.fulfill({json:{answer:'Test-only answer',mode:'database'},headers:{'access-control-allow-origin':'*'}});
 });
 await page.getByRole('button',{name:'More pages'}).click();await page.getByRole('button',{name:'How do I…?'}).click();
 await expect(page.getByRole('dialog',{name:'Store Assistant'})).toBeVisible();
 await page.getByRole('textbox',{name:'Message to Store Assistant'}).fill('What are our best-selling parts?');
 await page.getByRole('button',{name:'Send message'}).click();await expect(page.getByRole('button',{name:'Send message'})).toBeDisabled();
 for(let i=0;i<5;i++){await page.keyboard.press('Tab');expect(await page.getByRole('dialog',{name:'Store Assistant'}).evaluate(el=>el.contains(document.activeElement))).toBe(true);}
 await expect.poll(()=>typeof release).toBe('function');release();await expect(page.getByText('Test-only answer')).toBeVisible();
 await page.keyboard.press('Escape');expect(await page.locator('#root').evaluate(el=>el.inert)).toBe(false);
});

test('owner pages fit on a phone and their visible form controls have labels',async({page,context})=>{
 await setup(context,{role:'owner'});await page.setViewportSize({width:320,height:740});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const [path,title] of [['/imports','Import spreadsheets'],['/backups','Backup copies'],['/users','Staff access'],['/settings','Settings']]){
  await page.goto(path);await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  await expect(page.locator('main').getByRole('status').filter({hasText:/Loading|Opening|Checking|Getting/})).toHaveCount(0);
  const layout=await page.evaluate(()=>({fits:document.documentElement.scrollWidth<=innerWidth,overflow:[...document.querySelectorAll('main *')].filter(el=>el.getClientRects().length&&el.getBoundingClientRect().right>innerWidth).slice(0,5).map(el=>({tag:el.tagName,class:el.className,right:el.getBoundingClientRect().right}))}));
  expect(layout.fits,`${path} overflows: ${JSON.stringify(layout.overflow)}`).toBe(true);
  const unlabeled=await page.locator('main').evaluate(main=>[...main.querySelectorAll('input,select,textarea')].filter(el=>el.getClientRects().length&&!el.labels?.length&&!el.getAttribute('aria-label')&&!el.getAttribute('aria-labelledby')).map(el=>el.outerHTML));
  expect(unlabeled,`${path} controls need labels`).toEqual([]);
 }
 expect(errors).toEqual([]);
});
