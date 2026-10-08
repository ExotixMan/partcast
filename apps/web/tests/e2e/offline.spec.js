import {test,expect} from '@playwright/test';
const userId='11111111-1111-4111-8111-111111111111';
const productId='33333333-3333-4333-8333-333333333333';
const project='ragdjkdcrvexqfadlqbf';
async function setup(context){
 let stock=5,requests=[],receipts=new Set(),disconnected=false;
 await context.addInitScript(({userId,project})=>{
  if(!localStorage.getItem(`sb-${project}-auth-token`))localStorage.setItem(`sb-${project}-auth-token`,JSON.stringify({access_token:'test-only-token',refresh_token:'test-only-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:userId,email:'staff@example.test',aud:'authenticated'}}));
 },{userId,project});
 const product=()=>({id:productId,part_number:'BP-001',description:'Toyota brake pad',brand:'Toyota',unit:'pcs',location:'Shelf A',current_stock:stock,minimum_stock:2,selling_price:500,stock_status:stock<=0?'out':stock<=2?'low':'ok'});
 await context.route('http://localhost:10000/**',async route=>{
  if(disconnected){await route.abort('internetdisconnected');return;}
  const req=route.request(),url=new URL(req.url());let body;
  if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PATCH,OPTIONS','access-control-allow-headers':'authorization,content-type'}});return;}
  if(url.pathname==='/api/me')body={user:{id:userId,full_name:'Store Staff',role:'inventory_staff',active:true}};
  else if(url.pathname==='/api/offline-snapshot')body={products:[product()],suppliers:[]};
  else if(url.pathname==='/api/products')body={data:[product()],count:1};
  else if(url.pathname==='/api/suppliers'||url.pathname==='/api/notifications')body={data:[]};
  else if(url.pathname==='/api/dashboard')body={metrics:{totalProducts:1,lowStock:0,outOfStock:0,inventoryValue:1000},salesTrend:[],fastMoving:[],slowMoving:[],reorder:[],latestForecastRun:null};
  else if(url.pathname==='/api/inventory/movement'){
   const payload=req.postDataJSON();requests.push(payload);
   if(!receipts.has(payload.client_operation_id)){stock-=Number(payload.quantity);receipts.add(payload.client_operation_id);}
   body={transactionId:'test-transaction'};
  }else body={needsSetup:false};
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
 await expect(page.getByText(/Open Inventory, find the part/)).toBeVisible();
 await page.getByRole('button',{name:'Close Store Assistant'}).click();
 await page.getByRole('button',{name:'Sell',exact:true}).click();
 await page.getByLabel('Quantity *').fill('2');
 await expect(page.getByText('After this change:')).toContainText('3 pcs');
 await page.getByRole('button',{name:'Confirm stock change'}).click();
 await expect(page.getByText(/1 unsent transaction/)).toBeVisible();
 expect(backend.requests.length).toBe(0);
 await page.reload();
 await expect(page.getByText(/1 unsent transaction/)).toBeVisible();
 backend.setDisconnected(false);
 await context.setOffline(false);
 await expect.poll(()=>backend.requests.length,{timeout:15000}).toBe(1);
 await expect(page.getByText('Connected',{exact:true})).toBeVisible();
 expect(backend.getStock()).toBe(3);
 await page.getByRole('button',{name:'Sync now'}).click();
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
  await expect(page.getByRole('heading',{name:'Inventory',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Open Store Assistant'}).click();
  await page.getByRole('textbox',{name:'Message to Store Assistant'}).fill('How do I record a sale?');
  await page.getByRole('button',{name:'Send message'}).click();
  await expect(page.getByText(/Open Inventory, find the part/)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`/tmp/partcast-${size.name}.png`,fullPage:true});
 });
}
test('sign out deletes account cache; next account cannot read it',async({page,context})=>{
 await setup(context);await page.goto('/inventory');await expect(page.getByText(/Inventory saved/)).toBeVisible();
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Sign in to PartCast'})).toBeVisible();
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
 await page.getByRole('button',{name:'Sign in securely'}).click();
 await expect(page.getByText(/Cannot reach the sign-in service/)).toBeVisible({timeout:20000});
 await expect(page.getByRole('button',{name:'Sign in securely'})).toBeEnabled();
});

test('reports download Excel and reject an HTML page returned by a misconfigured API',async({page,context})=>{
 await setup(context);
 let wrongServer=false;
 await context.route('http://localhost:10000/api/reports/inventory.xlsx',async route=>{
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
