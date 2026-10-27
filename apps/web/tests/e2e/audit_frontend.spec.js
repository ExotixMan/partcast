import {test,expect} from '@playwright/test';

const project='ragdjkdcrvexqfadlqbf',userId='11111111-1111-4111-8111-111111111111',sessionId='77777777-7777-4777-8777-777777777777';
const partId='33333333-3333-4333-8333-333333333333',debtA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',debtB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const token=`e30.${Buffer.from(JSON.stringify({session_id:sessionId,amr:[{method:'password'}]})).toString('base64url')}.test-only-signature`;
const headers={'access-control-allow-origin':'*'};
async function fixture(context,{extraProducts=[]}={}){
 await context.addInitScript(({project,userId,token})=>localStorage.setItem(`sb-${project}-auth-token`,JSON.stringify({access_token:token,refresh_token:'fixture-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:userId,email:'owner@example.test',aud:'authenticated'}})),{project,userId,token});
 const product={id:partId,part_number:'BP-001',description:'Brake pad',brand:'Toyota',unit:'pcs',current_stock:5,minimum_stock:1,selling_price:100,unit_cost:40,category:'parts',photo_paths:[],search_aliases:[]};
 const products=[product,...extraProducts];
 const debts=[{id:debtA,customer_name:'Alice',principal:100,balance:100,paid_amount:0,status:'open'},{id:debtB,customer_name:'Bea',principal:100,balance:100,paid_amount:0,status:'open'}];
 const batches=[],debtWrites=[];
 await context.route('http://localhost:10000/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type'}});
  let body={data:[]};
  if(url.pathname==='/api/me')body={user:{id:userId,full_name:'Store Owner',role:'owner',active:true,session_id:sessionId,verification_expires_at:'2099-01-01T00:00:00Z'}};
  else if(url.pathname==='/api/offline-snapshot')body={products,suppliers:[]};
  else if(url.pathname==='/api/products')body={data:products,count:products.length};
  else if(url.pathname==='/api/debts'&&req.method()==='GET')body={data:debts};
  else if(url.pathname==='/api/debts'&&req.method()==='POST'){debtWrites.push(req.postDataJSON());body={debtId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'};}
  else if(url.pathname==='/api/inventory/batch'){const payload=req.postDataJSON();batches.push(payload);for(const line of payload.lines)products.find(p=>p.id===line.product_id).current_stock+=(payload.tx_type==='sale'?-1:1)*line.quantity;body={batchId:'fixture-basket'};}
  await route.fulfill({json:body,headers});
 });
 return {product,debts,batches,debtWrites};
}
async function finishResponse(page,response){await (await response).finished();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}

test('very low selling prices need review again after basket edits and cannot bypass confirmation',async({page,context})=>{
 const api=await fixture(context),priceWrites=[];
 await context.route(`http://localhost:10000/api/products/${partId}`,async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  const changes=route.request().postDataJSON();priceWrites.push(changes);Object.assign(api.product,changes);
  return route.fulfill({json:{product:api.product},headers});
 });
 await page.goto('/counter');
 await page.getByRole('button',{name:'Add Brake pad to basket'}).click();
 const basket=page.locator('#store-basket'),price=page.getByLabel('Price per unit',{exact:true}),quantity=page.getByLabel('Quantity',{exact:true});
 const confirm=page.getByRole('button',{name:'3. Confirm sale'}),review=page.getByLabel('I checked these selling prices.');
 await price.fill('0.10');
 await expect(page.getByText('This price is below ₱1. Please check before saving.',{exact:true})).toBeVisible();
 await expect(confirm).toBeDisabled();
 await basket.evaluate(form=>form.requestSubmit());
 await expect(page.getByRole('alert')).toContainText('Check the low selling prices before saving.');
 expect(api.batches).toHaveLength(0);
 await basket.getByText('Use as regular price',{exact:true}).click();
 await basket.getByRole('button',{name:'Save price to inventory',exact:true}).click();
 expect(priceWrites).toHaveLength(0);
 await review.check();await expect(confirm).toBeEnabled();
 await basket.getByRole('button',{name:'Save price to inventory',exact:true}).click();
 await expect.poll(()=>priceWrites.length).toBe(1);expect(priceWrites[0]).toEqual({selling_price:0.1});
 await price.fill('0.20');await expect(review).not.toBeChecked();await expect(confirm).toBeDisabled();
 await review.check();await quantity.fill('0.1');
 await expect(quantity).toHaveAttribute('aria-invalid','true');await expect(confirm).toBeDisabled();
 await quantity.fill('2');await expect(review).not.toBeChecked();await review.check();
 await confirm.click();await expect.poll(()=>api.batches.length).toBe(1);
 expect(api.batches[0].lines).toEqual([{product_id:partId,quantity:2,unit_price:0.2}]);expect(api.product.current_stock).toBe(3);
});

test('optional sale details stay closed and whole-unit controls fit phone and desktop',async({page,context})=>{
 await fixture(context);await page.setViewportSize({width:390,height:844});await page.goto('/counter');
 await page.getByRole('button',{name:'Add Brake pad to basket'}).click();
 const basket=page.locator('#store-basket');
 await expect(basket.getByLabel('Customer name (optional)',{exact:true})).toBeHidden();
 await expect(basket.getByLabel('Reference number',{exact:true})).toBeHidden();
 await expect(basket.getByLabel('Quantity',{exact:true})).toHaveAttribute('step','1');
 await basket.getByText('Customer, reference or note',{exact:true}).click();
 await expect(basket.getByLabel('Customer name (optional)',{exact:true})).toBeVisible();
 await basket.getByLabel('Customer name (optional)',{exact:true}).fill('Juan');
 await basket.getByLabel('Customer will pay later').check();
 await expect(basket.getByLabel('Customer name *',{exact:true})).toHaveValue('Juan');
 await basket.getByLabel('Customer will pay later').uncheck();
 await basket.getByText('Customer, reference or note',{exact:true}).click();
 for(const width of [320,768,1440]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'/tmp/partcast-counter-simplified-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.locator('.counter-basket-shortcut').getByRole('link',{name:'View basket'}).click();
 await expect(page.locator('.counter-basket-shortcut')).toHaveCount(0);
 await page.getByRole('button',{name:'3. Confirm sale'}).scrollIntoViewIfNeeded();
 await page.screenshot({path:'/tmp/partcast-counter-simplified-phone.png',fullPage:false});
});

test('a fractional sale cannot save while free delivery and a cash sale with a hidden old due date can',async({page,context})=>{
 const api=await fixture(context);await page.goto('/counter');await expect(page.getByText(/Inventory saved/)).toBeVisible();await page.getByRole('button',{name:'Add Brake pad to basket'}).click();
 await page.getByLabel('Quantity',{exact:true}).fill('0.01');await page.getByLabel('Price per unit',{exact:true}).fill('0.01');await expect(page.getByRole('button',{name:'3. Confirm sale'})).toBeDisabled();await expect(page.getByRole('alert').first()).toContainText('Enter a whole-number quantity of 1 or more.');expect(api.batches).toHaveLength(0);
 await page.getByLabel('Quantity',{exact:true}).fill('1');await page.getByLabel('Price per unit',{exact:true}).fill('100');await page.getByLabel('Customer will pay later').check();await page.getByLabel('Customer name *').fill('Juan');await page.getByLabel('Due date (optional)').fill('2020-01-01');await page.getByLabel('Customer will pay later').uncheck();await page.getByRole('button',{name:'3. Confirm sale'}).click();await expect.poll(()=>api.batches.length).toBe(1);expect(api.batches[0].is_credit).toBe(false);expect(api.batches[0].due_date).toBe(null);
 await page.getByRole('button',{name:'Receive delivery',exact:true}).click();await page.getByRole('button',{name:'Add Brake pad to basket'}).click();await page.getByLabel('Cost per unit',{exact:true}).fill('0');await page.getByRole('button',{name:'3. Confirm delivery'}).click();await page.getByRole('button',{name:'Yes, receive these items',exact:true}).click();await expect.poll(()=>api.batches.length).toBe(2);expect(api.batches[1].tx_type).toBe('stock_in');expect(api.batches[1].lines[0].unit_price).toBe(0);
});

test('each sale line needs whole units even in a positive basket and a fully paid sale has no due date',async({page,context})=>{
 const api=await fixture(context,{extraProducts:[{id:'22222222-2222-4222-8222-222222222222',part_number:'OF-002',description:'Oil filter',current_stock:5,minimum_stock:1,selling_price:80,unit_cost:30,unit:'pcs',category:'parts',photo_paths:[]}]});
 await page.goto('/counter');await expect(page.getByText(/Inventory saved/)).toBeVisible();await page.getByRole('button',{name:'Add Brake pad to basket'}).click();await page.getByRole('button',{name:'Add Oil filter to basket'}).click();
 await page.getByLabel('Quantity',{exact:true}).nth(0).fill('0.01');await page.getByLabel('Price per unit',{exact:true}).nth(0).fill('0.01');await expect(page.getByRole('button',{name:'3. Confirm sale'})).toBeDisabled();await expect(page.getByRole('alert').first()).toContainText('Enter a whole-number quantity of 1 or more.');expect(api.batches).toHaveLength(0);
 await page.getByLabel('Quantity',{exact:true}).nth(0).fill('1');await page.getByLabel('Price per unit',{exact:true}).nth(0).fill('1');await page.getByLabel('Customer will pay later').check();await page.getByLabel('Customer name *').fill('Maria');await page.getByLabel('Due date (optional)').fill('2020-01-01');await page.getByRole('button',{name:'3. Confirm sale'}).click();await expect(page.getByRole('alert')).toContainText('Choose a due date today or later.');expect(api.batches).toHaveLength(0);await page.getByLabel('Amount paid now').fill('81');await page.getByRole('button',{name:'3. Confirm sale'}).click();await expect.poll(()=>api.batches.length).toBe(1);expect(api.batches[0].lines).toHaveLength(2);expect(api.batches[0].paid_amount).toBe(81);expect(api.batches[0].due_date).toBe(null);
});

test('a late catalog failure cannot replace a newer successful search',async({page,context})=>{
 await fixture(context);let releaseOld,oldRequested=false;
 const oldGate=new Promise(resolve=>releaseOld=resolve);
 await context.route('http://localhost:10000/api/products?**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();const q=new URL(route.request().url()).searchParams.get('q');
  if(q==='old'){oldRequested=true;await oldGate;return route.fulfill({status:503,json:{error:'Outdated catalog failure'},headers});}
  if(q==='new')return route.fulfill({json:{data:[{id:partId,description:'New result',part_number:'NEW-1',current_stock:4,selling_price:20,unit:'pcs',photo_paths:[]}],count:1},headers});
  return route.fallback();
 });
 await page.goto('/counter');await page.getByLabel('Find a part',{exact:true}).fill('old');await expect.poll(()=>oldRequested).toBe(true);await page.getByLabel('Find a part',{exact:true}).fill('new');await expect(page.getByRole('heading',{name:'New result',exact:true})).toBeVisible();const oldResponse=page.waitForResponse(response=>new URL(response.url()).searchParams.get('q')==='old');releaseOld();await finishResponse(page,oldResponse);await expect(page.getByRole('alert').filter({hasText:'Outdated catalog failure'})).toHaveCount(0);
});

test('payment history stays with the selected customer and explains loading or retry',async({page,context})=>{
 await fixture(context);let releaseA,requestedA=false,failB=true;
 const pendingA=new Promise(resolve=>releaseA=resolve);
 await context.route('http://localhost:10000/api/debts/*/payments',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  if(route.request().url().includes(debtA)){requestedA=true;await pendingA;return route.fulfill({json:{data:[{id:'a-pay',amount:111,paid_at:'2026-10-10T00:00:00Z'}]},headers});}
  if(failB)return route.fulfill({status:503,json:{error:'Payments could not load'},headers});
  return route.fulfill({json:{data:[{id:'b-pay',amount:222,paid_at:'2026-10-11T00:00:00Z'}]},headers});
 });
 await page.goto('/debts');const card=name=>page.getByRole('article').filter({has:page.getByRole('heading',{name,exact:true})});await card('Alice').getByRole('button',{name:'View payments'}).click();const dialog=page.getByRole('dialog');await expect.poll(()=>requestedA).toBe(true);await expect(dialog.getByRole('status')).toContainText('Loading payments');await expect(dialog.getByText('No payments recorded yet.')).toHaveCount(0);await dialog.getByRole('button',{name:'Close',exact:true}).click();
 await card('Bea').getByRole('button',{name:'View payments'}).click();await expect(dialog.getByRole('alert')).toContainText('Payments could not load');failB=false;await dialog.getByRole('button',{name:'Try again',exact:true}).click();await expect(dialog).toContainText('222.00');const oldResponse=page.waitForResponse(response=>response.url().includes(`${debtA}/payments`));releaseA();await finishResponse(page,oldResponse);await expect(dialog).not.toContainText('111.00');await expect(dialog).toContainText('Bea');
});

test('a success message cannot block the next customer form and dismisses after six seconds',async({page,context})=>{
 const api=await fixture(context);await page.clock.install();await page.setViewportSize({width:390,height:844});await page.goto('/debts');
 for(const name of ['Camila','Dina']){
  await page.getByRole('button',{name:'Add existing utang'}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Customer name *').fill(name);await dialog.getByLabel('Amount still owed').fill('20');await dialog.getByRole('button',{name:'Save utang',exact:true}).click();await expect(dialog).toHaveCount(0);
 }
 expect(api.debtWrites).toHaveLength(2);await expect(page.getByText('Customer utang saved.',{exact:true})).toBeVisible();await page.clock.fastForward(6100);await expect(page.getByText('Customer utang saved.',{exact:true})).toHaveCount(0);
});

test('Restock export forwards its selected category and customer balances remain independent of it',async({page,context})=>{
 await fixture(context);const requests=[];
 await context.route('http://localhost:10000/api/reports/**',route=>{if(route.request().method()==='OPTIONS')return route.fallback();requests.push(new URL(route.request().url()));return route.fulfill({body:'fixture-report',contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',headers});});
 await page.goto('/reports');await page.getByRole('combobox',{name:'Category',exact:true}).selectOption('lubricants');await page.getByRole('button',{name:'Download Excel: Reorder report'}).click();await expect.poll(()=>requests.length).toBe(1);expect(requests[0].searchParams.get('category')).toBe('lubricants');await page.getByRole('button',{name:'Download Excel: Customer utang report'}).click();await expect.poll(()=>requests.length).toBe(2);expect(requests[1].searchParams.get('category')).toBe('all');
});
