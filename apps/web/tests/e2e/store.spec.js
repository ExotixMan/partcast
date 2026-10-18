import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
const ExcelJS=createRequire(new URL('../../../server/package.json',import.meta.url))('exceljs');
const userId='11111111-1111-4111-8111-111111111111',p1='33333333-3333-4333-8333-333333333333',p2='99999999-9999-4999-8999-999999999999',project='ragdjkdcrvexqfadlqbf',supplier='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sid='77777777-7777-4777-8777-777777777777';
const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({session_id:sid,amr:[{method:'password'}]})).toString('base64url')+'.test-only-signature';
async function fixture(context,{role='owner'}={}){
 await context.addInitScript(({userId,project,token})=>localStorage.setItem(`sb-${project}-auth-token`,JSON.stringify({access_token:token,refresh_token:'test-only-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:userId,email:'staff@example.test',aud:'authenticated'}})),{userId,project,token});
 const products=[{id:p1,part_number:'BP-001',description:'Toyota brake pad',brand:'Toyota',unit:'pcs',location:'Shelf A',current_stock:5,minimum_stock:1,safety_stock:1,selling_price:500,unit_cost:100,category:'parts',barcode:'123456789012',search_aliases:['pastilyas'],photo_paths:[],stock_status:'ok'},{id:p2,part_number:'OIL-001',description:'Engine oil',brand:'Brand',unit:'bottles',location:'Shelf B',current_stock:8,minimum_stock:2,selling_price:100,unit_cost:60,category:'lubricants',barcode:'987654321098',search_aliases:['langis ng makina'],photo_paths:[],stock_status:'ok'}];
 const batches=[],debts=[],payments=[],emails=[],productWrites=[],photoUploads=[];let disconnected=false;const receipts=new Map();
 await context.route('http://localhost:10000/**',async route=>{
 const req=route.request(),url=new URL(req.url()),headers={'access-control-allow-origin':'*'};
 if(disconnected){await route.abort('internetdisconnected');return;}
 if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type'}});return;}
 let body={data:[]};
 if(url.pathname==='/api/me')body={user:{id:userId,full_name:'Store Staff',role,active:true,session_id:sid,verification_expires_at:'2099-01-01T00:00:00Z'}};
 else if(url.pathname==='/api/forecast/readiness')body={ready:false,status:'no_observations',record_count:0,current_part_count:0,latest_sale_date:null,products:[],requirements:{sale_days:5,calendar_days:35,maximum_age_days:31}};
 else if(url.pathname==='/api/offline-snapshot')body={products,suppliers:[{id:supplier,name:'Parts supplier'}]};
 else if(url.pathname==='/api/products'&&req.method()==='GET'){const q=(url.searchParams.get('q')||'').toLowerCase(),category=url.searchParams.get('category');const data=products.filter(p=>`${p.description} ${p.barcode} ${p.search_aliases.join(' ')}`.toLowerCase().includes(q)&&(!category||category==='all'||p.category===category));body={data,count:data.length};}
 else if(url.pathname==='/api/products'&&req.method()==='POST'){const payload=req.postDataJSON();productWrites.push(payload);body={product:{...payload,id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'}};}
 else if(url.pathname.startsWith('/api/products/')&&req.method()==='PATCH'){productWrites.push(req.postDataJSON());body={product:req.postDataJSON()};}
 else if(url.pathname==='/api/inventory/batch'){
 const b=req.postDataJSON();batches.push(b);
 if(!receipts.has(b.client_operation_id)){for(const l of b.lines)products.find(p=>p.id===l.product_id).current_stock+=(b.tx_type==='sale'?-1:1)*l.quantity;
 const total=b.lines.reduce((s,l)=>s+Math.round(l.quantity*l.unit_price*100),0)/100;
 if(b.is_credit&&total>b.paid_amount)debts.push({id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',customer_name:b.customer_name,principal:total-b.paid_amount,paid_amount:0,balance:total-b.paid_amount,due_date:b.due_date,occurred_at:b.occurred_at,status:'open'});
 receipts.set(b.client_operation_id,{batchId:'fake-basket',total});}
 body=receipts.get(b.client_operation_id);
 }
 else if(url.pathname==='/api/debts'&&req.method()==='GET')body={data:debts};
 else if(url.pathname==='/api/debts'&&req.method()==='POST'){const b=req.postDataJSON();if(!receipts.has(b.client_operation_id)){const debt={...b,id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',balance:b.principal,paid_amount:0,status:b.due_date&&b.due_date<'2026-10-10'?'overdue':'open'};debts.push(debt);receipts.set(b.client_operation_id,{debtId:debt.id,balance:debt.balance});}body=receipts.get(b.client_operation_id);}
 else if(url.pathname.endsWith('/payments'))body={data:payments};
 else if(url.pathname==='/api/debts/payment'){const b=req.postDataJSON();payments.push(b);const d=debts.find(d=>d.id===b.debt_id);d.paid_amount+=b.amount;d.balance-=b.amount;d.status=d.balance?'open':'paid';body={balance:d.balance};}
 else if(url.pathname.startsWith('/api/barcode/'))body={product:products.find(p=>p.barcode===decodeURIComponent(url.pathname.split('/').at(-1)))||null};
 else if(url.pathname==='/api/suppliers')body={data:[{id:supplier,name:'Parts supplier',email:'supplier@example.test'}]};
 else if(url.pathname==='/api/reorder')body={data:[{product_id:p1,part_number:'BP-001',description:'Toyota brake pad',unit:'pcs',supplier_id:supplier,supplier_name:'Parts supplier',supplier_email:'supplier@example.test',current_stock:1,recommended_quantity:5,status:'low_stock'},...(url.searchParams.get('onlyNeeded')==='false'?[{product_id:p2,part_number:'OIL-001',description:'Engine oil',unit:'bottles',supplier_id:supplier,supplier_name:'Parts supplier',supplier_email:'supplier@example.test',current_stock:8,recommended_quantity:0,status:'ok'}]:[])]};
 else if(url.pathname.startsWith('/api/admin/supplier-email/')){emails.push(req.postDataJSON());body={message:'Email sent',items:1};}
 else if(url.pathname.startsWith('/api/photos/')&&req.method()==='POST'){photoUploads.push(req.postData());products[0].photo_paths=[`${p1}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp`];body={photo_paths:products[0].photo_paths};}
 else if(url.pathname.startsWith('/api/photos/')&&req.method()==='DELETE'){products[0].photo_paths=[];body={photo_paths:[]};}
 else if(url.pathname.startsWith('/api/photos/')){await route.fulfill({body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'),contentType:'image/png',headers});return;}
 else if(url.pathname==='/api/dashboard')body={metrics:{totalProducts:2,lowStock:0,outOfStock:0,inventoryValue:980},salesTrend:[],fastMoving:[],slowMoving:[],reorder:[]};
 await route.fulfill({json:body,headers});
 });
 return {batches,debts,payments,emails,products,productWrites,photoUploads,disconnect:value=>{disconnected=value;}};
}
test('multi-part credit sale records customer balance and partial payment',async({page,context})=>{
 const api=await fixture(context);await page.goto('/counter');await expect(page.getByText(/Inventory saved/)).toBeVisible();
 await page.getByRole('button',{name:'Add Toyota brake pad to basket'}).click();await page.getByRole('button',{name:'Add Engine oil to basket'}).click();
 await page.getByLabel('Quantity',{exact:true}).nth(0).fill('2');await page.getByLabel('Customer will pay later').check();await page.getByLabel('Customer name *').fill('Juan');await page.getByLabel('Amount paid now').fill('200');
 await expect(page.getByText('Remaining utang:')).toContainText('900');await page.getByRole('button',{name:'3. Confirm sale'}).click();
 await expect.poll(()=>api.batches.length).toBe(1);expect(api.batches[0].lines).toHaveLength(2);expect(api.products[0].current_stock).toBe(3);expect(api.products[1].current_stock).toBe(7);
 await page.goto('/debts');await expect(page.getByRole('heading',{name:'Juan'})).toBeVisible();await page.getByRole('button',{name:'Record payment'}).click();await page.getByLabel('Amount received').fill('901');await page.getByRole('button',{name:'Save payment'}).click();expect(api.payments).toHaveLength(0);
 await page.getByLabel('Amount received').fill('400');await page.getByRole('button',{name:'Save payment'}).click();await expect.poll(()=>api.payments.length).toBe(1);expect(api.debts[0].balance).toBe(500);
 await page.getByRole('button',{name:'View payments'}).click();await expect(page.getByRole('dialog')).toContainText('400');
});
test('offline basket includes all parts and sends once after reconnect',async({page,context})=>{
 await page.setViewportSize({width:390,height:844});const api=await fixture(context);await page.goto('/counter');await expect(page.getByText(/Inventory saved/)).toBeVisible();await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 api.disconnect(true);await context.setOffline(true);await expect(page.getByText('Working offline',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Add Toyota brake pad to basket'}).click();await page.getByRole('button',{name:'Add Engine oil to basket'}).click();await page.getByRole('button',{name:'3. Confirm sale'}).click();
 await expect(page.getByText(/1 unsent transaction/)).toBeVisible();expect(api.batches).toHaveLength(0);
 await page.reload();await expect(page.getByText(/1 unsent transaction/)).toBeVisible();api.disconnect(false);await context.setOffline(false);await expect.poll(()=>api.batches.length,{timeout:15000}).toBe(1);await expect(page.getByText('Connected',{exact:true})).toBeVisible();expect(api.products.map(p=>p.current_stock)).toEqual([4,7]);
});
test('barcode lookup, unknown guided add and inventory categories work',async({page,context})=>{
 const api=await fixture(context);await page.goto('/counter');await page.getByRole('button',{name:'Scan',exact:true}).click();await page.getByLabel('Barcode number').fill('123456789012');await page.getByRole('button',{name:'Find this barcode'}).click();await expect(page.getByLabel('Quantity',{exact:true})).toHaveValue('1');
 await page.getByRole('button',{name:'Clear basket'}).click();await page.getByRole('button',{name:'Scan',exact:true}).click();await page.getByLabel('Barcode number').fill('NEW-001');await page.getByRole('button',{name:'Find this barcode'}).click();await page.getByRole('link',{name:'Add this part'}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByLabel('Barcode',{exact:true})).toHaveValue('NEW-001');await page.getByLabel('Part name *').fill('New gasket');await page.getByRole('button',{name:'Save part',exact:true}).click();await expect.poll(()=>api.productWrites.length).toBe(1);expect(api.productWrites[0].barcode).toBe('NEW-001');
 await expect(page.getByRole('dialog')).toHaveCount(0);await page.getByRole('region',{name:'Your inventory'}).getByLabel('Category',{exact:true}).selectOption('lubricants');await expect(page.getByText('Engine oil',{exact:true}).first()).toBeVisible();await expect(page.getByText('Toyota brake pad',{exact:true})).toHaveCount(0);
});
test('supplier review sends the edited message and quantities',async({page,context})=>{
 const api=await fixture(context);await page.goto('/reorder');await page.getByRole('button',{name:'Review supplier email'}).click();await expect(page.getByLabel('Quantity *')).toHaveValue('2');await page.getByLabel('Email subject *').fill('Our parts order');await page.getByLabel('Your message *').fill('Please deliver next week.');await page.getByLabel('Quantity *').fill('2.5');await page.getByLabel('Description *').fill('Toyota front brake pad');await page.getByRole('button',{name:'Send email to supplier'}).click();await expect.poll(()=>api.emails.length).toBe(1);expect(api.emails[0].message).toBe('Please deliver next week.');expect(api.emails[0].items[0].quantity).toBe(2.5);expect(api.emails[0].items[0].description).toBe('Toyota front brake pad');
});
for(const width of [390,1440])test(`small purchase suggestions keep forecast totals and costs clear at ${width}px`,async({page,context})=>{
 await page.setViewportSize({width,height:900});await fixture(context);
 const data=[{product_id:p1,part_number:'BP-001',description:'Toyota brake pad',unit:'pcs',supplier_id:supplier,supplier_name:'Parts supplier',supplier_email:'supplier@example.test',current_stock:0,minimum_stock:1,predicted_quantity:11,recommended_quantity:11,estimated_unit_cost:100,estimated_order_cost:1100,status:'out_of_stock'}];
 await context.route('http://localhost:10000/api/reorder**',route=>route.request().method()==='OPTIONS'?route.fallback():route.fulfill({json:{data},headers:{'access-control-allow-origin':'*'}}));
 await page.goto('/reorder');
 const row=(width<1024?page.getByRole('article'):page.getByRole('row')).filter({hasText:'Toyota brake pad'});
 await expect(row).toContainText('11');await expect(row).toContainText('2 units');await expect(row).toContainText('₱200.00');await expect(row).not.toContainText('₱1,100.00');
 await expect(page.getByText(/Suggested purchases are 1–2 units per part/)).toBeVisible();
 await page.getByRole('button',{name:'Review supplier email'}).click();await expect(page.getByLabel('Quantity *')).toHaveValue('2');await page.getByRole('button',{name:'Keep reviewing'}).click();
 await page.getByLabel('Website language').selectOption('fil');await expect(row).toContainText('2');await expect(page.getByText(/Karaniwang 1–2 lang bawat piyesa/)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('supplier table supports custom columns, extra assigned parts, validation and a matching mobile preview',async({page,context})=>{
 await page.setViewportSize({width:390,height:844});const api=await fixture(context);await page.goto('/reorder');await page.getByRole('button',{name:'Review supplier email'}).click();
 await page.getByLabel('Column name',{exact:true}).fill('Delivery date');await page.getByRole('button',{name:'Add column',exact:true}).click();await page.getByLabel('Delivery date',{exact:true}).fill('Next Monday');
 await page.getByLabel('Add another part from this supplier').selectOption(p2);await page.getByRole('button',{name:'Add part to request'}).click();
 await expect(page.getByLabel('Quantity *',{exact:true})).toHaveCount(2);await page.getByLabel('Quantity *',{exact:true}).nth(1).fill('2.5');await page.getByLabel('Delivery date',{exact:true}).nth(1).fill('Next Tuesday');
 await expect(page.getByRole('table')).toContainText('Next Monday');await expect(page.getByRole('table')).toContainText('Next Tuesday');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByLabel('Column name',{exact:true}).fill('delivery date');await page.getByRole('button',{name:'Add column',exact:true}).click();await expect(page.getByRole('alert')).toContainText('unique column');
 await page.getByRole('button',{name:'Send email to supplier'}).click();await expect.poll(()=>api.emails.length).toBe(1);expect(api.emails[0].extra_columns).toHaveLength(1);const id=api.emails[0].extra_columns[0].id;
 expect(api.emails[0].items).toHaveLength(2);expect(api.emails[0].items[0].extra_values[id]).toBe('Next Monday');expect(api.emails[0].items[1].extra_values[id]).toBe('Next Tuesday');expect(api.emails[0].items[1].quantity).toBe(2.5);
});
test('restock list updates after stock changes and a removed custom column leaves no hidden values',async({page,context})=>{
 await fixture(context);let data=[{product_id:p1,part_number:'BP-001',description:'Toyota brake pad',supplier_id:supplier,supplier_name:'Parts supplier',supplier_email:'supplier@example.test',current_stock:1,minimum_stock:1,recommended_quantity:1,status:'low_stock'}];
 await context.route('http://localhost:10000/api/reorder**',route=>route.request().method()==='OPTIONS'?route.fallback():route.fulfill({json:{data},headers:{'access-control-allow-origin':'*'}}));await page.goto('/reorder');await page.getByRole('button',{name:'Review supplier email'}).click();
 await page.getByLabel('Column name',{exact:true}).fill('Notes');await page.getByRole('button',{name:'Add column',exact:true}).click();await page.getByLabel('Notes',{exact:true}).fill('Fragile');await page.getByRole('button',{name:'Remove column Notes'}).click();await expect(page.getByLabel('Notes',{exact:true})).toHaveCount(0);await expect(page.getByRole('dialog').getByRole('table')).not.toContainText('Fragile');
 await page.getByRole('button',{name:'Keep reviewing'}).click();data=[];await page.evaluate(()=>window.dispatchEvent(new Event('partcast:queue')));await expect(page.getByRole('heading',{name:'No parts are currently suggested for restocking'})).toBeVisible();
});
test('Tagalog and dark mode persist; assistant clarifies coolant versus radiator',async({page,context})=>{
 await fixture(context);await page.setViewportSize({width:390,height:844});await page.goto('/debts');await page.getByLabel('Website language').selectOption('fil');await expect(page.getByRole('heading',{name:'Utang ng customer'})).toBeVisible();await page.getByRole('button',{name:'Laki ng text at kulay'}).click();await page.getByRole('button',{name:'Gamitin ang dark mode'}).click();await page.getByRole('button',{name:'Tapos na',exact:true}).click();expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');
 await page.reload();await expect(page.getByRole('heading',{name:'Utang ng customer'})).toBeVisible();expect(await page.locator('html').getAttribute('lang')).toBe('fil');expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Buksan ang katulong sa tindahan'}).click();await page.getByLabel('Mensahe sa katulong sa tindahan').fill('Pareho ba ang coolant at radiator?');await page.getByRole('button',{name:'Ipadala ang mensahe'}).click();await expect(page.getByText(/magkaibang produkto/i)).toBeVisible();
});
test('assistant replies show readable part lists, everyday Tagalog and safe text on a phone',async({page,context})=>{
 await fixture(context);await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 let submitted;
 await context.route('http://localhost:10000/api/assistant/chat',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();submitted=route.request().postDataJSON();
  const answer=submitted.message==='test safe text'?'<img src=x onerror="window.__unexpected=1">':
   'Ito ang puwedeng orderin:\n\n- OIL FILTER\n  Part no. 90915-YZZD2\n  Order: **2 piraso**\n- FUEL FILTER\n  Part no. 23303-64010\n  Order: **1 piraso**\n- BEARING ASSY\n  Part no. C014\n  Order: **2 piraso**\n\n1–2 lang bawat piyesa sa isang order. Tingnan muna ang stock bago umorder ulit.';
  await route.fulfill({json:{answer,mode:'database'},headers:{'access-control-allow-origin':'*'}});
 });
 await page.goto('/');await page.getByLabel('Website language').selectOption('fil');await page.getByRole('button',{name:'Buksan ang katulong sa tindahan'}).click();
 await page.getByRole('button',{name:'Ano ang dapat orderin?',exact:true}).click();
 const log=page.getByRole('log');await expect(log.getByRole('listitem')).toHaveCount(3);
 await expect(log.getByText('90915-YZZD2',{exact:false})).toBeVisible();await expect(log.locator('strong').first()).toHaveText('2 piraso');
 await expect(log.getByText('Base sa mga na-save na record')).toBeAttached();expect(submitted.language).toBe('fil');
 expect(await log.locator('.assistant-reply').last().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
 expect(await log.locator('.assistant-reply').last().evaluate(el=>getComputedStyle(el).fontFamily)).toContain('Arial');
 await page.screenshot({path:'/tmp/partcast-chat-phone.png'});
 await page.getByRole('textbox',{name:'Mensahe sa katulong sa tindahan'}).fill('test safe text');await page.getByRole('button',{name:'Ipadala ang mensahe'}).click();
 await expect(log.getByText('<img src=x onerror="window.__unexpected=1">',{exact:true})).toBeAttached();await expect(log.locator('img')).toHaveCount(0);expect(await page.evaluate(()=>window.__unexpected)).toBeUndefined();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('larger text persists and daily workflows fit phone, tablet and desktop',async({page,context})=>{
 await fixture(context);await page.setViewportSize({width:320,height:840});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await page.getByRole('button',{name:'Text and display'}).click();await page.getByRole('button',{name:'Larger text',exact:true}).click();await page.getByRole('button',{name:'Done',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-text-size','large');
 for(const width of [320,768,1440]){
  await page.setViewportSize({width,height:1000});
  for(const path of ['/','/counter','/inventory','/forecast','/reorder','/debts','/sales','/reports']){
   await page.goto(path);await expect(page.locator('main h1')).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px ${path}`).toBe(true);
  }
 }
 await page.goto('/inventory');await expect(page.getByRole('heading',{name:'Inventory',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Your inventory'})).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-text-size','large');expect(await page.locator('html').evaluate(el=>getComputedStyle(el).fontSize)).toBe('18px');
 await page.screenshot({path:'/tmp/partcast-inventory-desktop.png'});
 await page.getByRole('button',{name:'Text and display'}).click();await page.getByRole('button',{name:'Use dark mode'}).click();await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.locator('html')).toHaveAttribute('data-text-size','large');
 expect(errors).toEqual([]);
});
test('part photos validate upload and show saved images',async({page,context})=>{
 const api=await fixture(context);await page.setViewportSize({width:390,height:844});await page.goto('/inventory');const card=page.getByRole('article').filter({hasText:'Toyota brake pad'});await card.getByRole('button',{name:'Edit details'}).click();
 await page.locator('input[type=file]').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('not an image')});await expect(page.getByRole('alert')).toContainText('JPEG');expect(api.photoUploads).toHaveLength(0);
 await page.locator('input[type=file]').setInputFiles({name:'part.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});await expect.poll(()=>api.photoUploads.length).toBe(1);await expect(page.getByRole('dialog').locator('img')).toBeVisible();await page.getByRole('button',{name:'Remove photo'}).click();await expect(page.getByRole('dialog').locator('img')).toHaveCount(0);
});
test('imports guide a simulated workbook to an open demo and treat timeouts as unconfirmed',async({page,context})=>{
 await fixture(context);await page.setViewportSize({width:390,height:844});let failNetwork=false,uploads=0;
 await context.route('http://localhost:10000/api/imports/spreadsheet',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  uploads++;
  if(failNetwork)return route.abort('timedout');
  await route.fulfill({status:422,json:{code:'SIMULATED_DEMAND',error:'This workbook contains simulated demand. Use the labelled forecasting demo on Plan ahead. Store training history was not changed.'},headers:{'access-control-allow-origin':'*'}});
 });
 await page.goto('/imports');
 await expect(page.getByRole('heading',{name:'Using the capstone demo workbook?'})).toHaveCount(0);
 await expect(page.getByRole('region',{name:'Saved past sales',exact:true})).toHaveCount(0);
 await page.getByLabel('Choose spreadsheet files').setInputFiles({name:'PartCast_Capstone_Forecasting_Improved.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('stubbed-upload')});
 await page.getByRole('button',{name:'Import 1 file',exact:true}).click();
 await expect(page.getByRole('region',{name:'Latest import results'})).toContainText('simulated demand');
 await page.getByRole('region',{name:'Latest import results'}).getByRole('link',{name:'Open forecasting demo'}).click();
 await expect(page).toHaveURL(/\/forecast-demo$/);
 await expect(page.getByLabel('Choose the capstone demo workbook')).toBeVisible();
 await page.goto('/imports');failNetwork=true;
 await page.getByLabel('Choose spreadsheet files').setInputFiles({name:'actual-sales.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('stubbed-upload')});
 await page.getByRole('button',{name:'Import 1 file',exact:true}).click();
 await expect(page.getByRole('region',{name:'Latest import results'})).toContainText('Import status unconfirmed:');
 await expect(page.getByRole('region',{name:'Latest import results'})).toContainText('Check Past imports');
 expect(uploads).toBe(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('saved past invoices appear after import, survive reload and support search, dates and pagination',async({page,context})=>{
 await fixture(context);await page.setViewportSize({width:390,height:844});
 let saved=[],uploads=0;const history=[],queries=[],headers={'access-control-allow-origin':'*'};
 const note='Sales rows were imported for reporting. No 1-unit demand proxy was created because the proxy option was not enabled.';
 const duplicates='21 invoice(s) already exist with the same reference, date, amount and description; they were not added again.';
 await context.route('http://localhost:10000/api/imports**',async route=>{
  const request=route.request();if(request.method()==='OPTIONS')return route.fallback();
  const url=new URL(request.url());
  if(url.pathname==='/api/imports/spreadsheet'){
   uploads++;expect(request.postData()).toContain('legacy-sales');expect(request.postData()).toContain('false');
   const added=saved.length?0:21;
   if(added)saved=Array.from({length:21},(_,index)=>({id:`saved-${index+1}`,reference_no:`SI#${index+1}`,sale_date:'2026-10-12',amount:index+1===1?1250.5:100,raw_items:index===0?'BP-001 Brake pad':`Other part ${index+1}`})).reverse();
   const result={detectedType:'legacy-sales',rowsImported:added,rowsSkipped:21-added,warnings:added?[note]:[duplicates,note]};
   history.unshift({id:`batch-${uploads}`,file_name:'invoices.xlsx',import_type:'legacy_sales',status:'completed',rows_read:21,rows_imported:added,rows_skipped:21-added,warnings:result.warnings,created_at:'2026-10-17T00:00:00Z'});
   return route.fulfill({json:result,headers});
  }
  if(url.pathname==='/api/imports/sales'){
   const q=url.searchParams.get('q')||'',from=url.searchParams.get('from'),to=url.searchParams.get('to'),current=Number(url.searchParams.get('page')||1);queries.push(Object.fromEntries(url.searchParams));
   const rows=saved.filter(row=>(!q||`${row.reference_no} ${row.raw_items}`.toLowerCase().includes(q.toLowerCase()))&&(!from||row.sale_date>=from)&&(!to||row.sale_date<=to));
   return route.fulfill({json:{data:rows.slice((current-1)*20,current*20),count:rows.length,page:current,pageSize:20},headers});
  }
  return route.fulfill({json:{data:history},headers});
 });
 await page.goto('/sales?source=imported');const panel=page.getByRole('region',{name:'Saved past sales',exact:true});
 await expect(panel.getByText('No past invoices are saved yet. Use Import spreadsheets to add your sales file.')).toBeVisible();
 await page.goto('/imports');
 await page.getByLabel('What is in these files?').selectOption('legacy-sales');
 await page.getByLabel('Choose spreadsheet files').setInputFiles({name:'invoices.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('fixture; real parsing checked in HTTP integration test')});
 await page.getByRole('button',{name:'Import 1 file',exact:true}).click();
 const results=page.getByRole('region',{name:'Latest import results'});
 await expect(results).toContainText('21 rows added · 0 skipped.');await expect(results).toContainText(note);
 await results.getByRole('link',{name:'View saved past sales'}).click();await expect(page).toHaveURL(/\/sales\?source=imported$/);
 await expect(panel.getByText('Invoices found: 21')).toBeVisible();await expect(panel.getByRole('article')).toHaveCount(20);
 await panel.getByRole('button',{name:'Next',exact:true}).click();await expect(panel.getByRole('article')).toHaveCount(1);await expect(panel.getByRole('article')).toContainText('BP-001 Brake pad');
 expect(queries.at(-1).page).toBe('2');
 await panel.getByLabel('Search reference or description').fill('BP-001');await panel.getByRole('button',{name:'Find invoices'}).click();
 await expect(panel.getByText('Invoices found: 1')).toBeVisible();await expect(panel.getByRole('article')).toContainText('1,250.50');expect(queries.at(-1).page).toBe('1');
 await panel.getByLabel('From date',{exact:true}).fill('2026-10-13');await panel.getByLabel('To date',{exact:true}).fill('2026-10-13');await panel.getByRole('button',{name:'Find invoices'}).click();
 await expect(panel.getByText('No invoices match these filters.')).toBeVisible();
 await panel.getByRole('button',{name:'Clear filters'}).click();await expect(panel.getByText('Invoices found: 21')).toBeVisible();
 await page.reload();await expect(panel.getByText('Invoices found: 21')).toBeVisible();
 await page.goto('/imports');
 await page.getByLabel('What is in these files?').selectOption('legacy-sales');
 await page.getByLabel('Choose spreadsheet files').setInputFiles({name:'invoices-copy.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('fixture')});
 await page.getByRole('button',{name:'Import 1 file',exact:true}).click();
 await expect(results.getByText('Check completed. No new rows were added.',{exact:true})).toBeVisible();await expect(results).toContainText(duplicates);expect(saved).toHaveLength(21);
 await results.getByRole('link',{name:'View saved past sales'}).click();
 await expect(panel.getByText('Invoices found: 21')).toBeVisible();
 for(const width of [390,768,1280]){
  await page.setViewportSize({width,height:900});
  if(width===1280)await expect(panel.getByRole('table')).toBeVisible();else await expect(panel.getByRole('article').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.getByLabel('Website language').selectOption('fil');
 await expect(page.getByRole('region',{name:'Naka-save na dating benta'})).toBeVisible();await expect(page.getByText('Mga invoice na nakita: 21')).toBeVisible();
 expect(uploads).toBe(2);
});
test('saved invoice read failures show a retry instead of an empty or successful import claim',async({page,context})=>{
 await fixture(context);let failed=true;
 await context.route('http://localhost:10000/api/imports/sales**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  await route.fulfill({status:failed?503:200,json:failed?{error:'Fixture store temporarily unavailable.'}:{data:[{id:'persisted',reference_no:'SI#20',sale_date:null,amount:null,raw_items:null}],count:1,page:1,pageSize:20},headers:{'access-control-allow-origin':'*'}});
 });
 await page.goto('/sales?source=imported');const panel=page.getByRole('region',{name:'Saved past sales',exact:true});
 await expect(panel.getByText('Saved invoices could not be loaded.')).toBeVisible();await expect(panel.getByText('Invoices found: 0')).toHaveCount(0);
 failed=false;await panel.getByRole('button',{name:'Try again',exact:true}).click();await expect(panel.getByText('Invoices found: 1')).toBeVisible();await expect(panel.getByRole('table').getByText('Date unavailable')).toBeVisible();
});
test('demand planning hides diagnostic panels and enables updates only after usable history is verified',async({page,context})=>{
 await fixture(context);await page.setViewportSize({width:390,height:844});
 let ready=false;const posted=[];
 await context.route('http://localhost:10000/api/forecast/readiness**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  const lastSale=ready?'2026-10-15':'2024-05-17';
  await route.fulfill({json:{ready,status:ready?'ready':'stale_history',record_count:23,current_part_count:ready?1:0,latest_sale_date:lastSale,requirements:{sale_days:5,calendar_days:35,maximum_age_days:31},products:[{product_id:p1,part_number:'BP-001',description:'Toyota brake pad',sale_days:7,calendar_days:1537,last_sale_date:lastSale,reasons:ready?[]:['old_history']}]},headers:{'access-control-allow-origin':'*'}});
 });
 await context.route('http://localhost:10000/api/forecast/train',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  posted.push(route.request().postDataJSON());await route.fulfill({json:{forecastCount:7},headers:{'access-control-allow-origin':'*'}});
 });
 await page.goto('/forecast');
 await expect(page.getByRole('heading',{name:'Can these sales train XGBoost?'})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Recorded sales',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Practice demo',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Update demand estimate',exact:true})).toBeDisabled();
 await expect(page.getByText('Add more recent sales before updating estimates.',{exact:true})).toBeVisible();
 await page.getByLabel('Website language').selectOption('fil');
 await expect(page.getByText('Magdagdag ng mas bagong benta bago i-update ang pagtataya.',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByLabel('Wika ng website').selectOption('en');
 ready=true;await page.getByRole('button',{name:'Refresh sales data',exact:true}).click();
 await expect(page.getByRole('button',{name:'Update demand estimate',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Update demand estimate',exact:true}).click();
 await expect.poll(()=>posted.length).toBe(1);expect(posted[0]).toEqual({horizonDays:30,includeProxy:false});
 await expect(page.getByText(/Demand estimate updated/)).toBeVisible();
});

test('a 25-second sales-history response stays pending and completes without the old 20-second timeout',async({page,context})=>{
 await fixture(context);let requests=0;
 await context.route('http://localhost:10000/api/forecast/readiness**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  requests++;
  await new Promise(resolve=>setTimeout(resolve,25000));
  await route.fulfill({json:{ready:false,status:'no_observations',record_count:0,current_part_count:0,latest_sale_date:null,products:[],requirements:{sale_days:5,calendar_days:35,maximum_age_days:31}},headers:{'access-control-allow-origin':'*'}});
 });
 await page.goto('/forecast');
 await expect(page.getByText('Preparing sales data…',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Update demand estimate',exact:true})).toBeDisabled();
 await expect(page.getByText('Still preparing. The server may need a moment to start.',{exact:true})).toBeVisible({timeout:12000});
 await expect(page.getByText('Record or import actual sales first.',{exact:true})).toBeVisible({timeout:30000});
 await expect(page.getByText('Sales history could not be checked.',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Refresh sales data',exact:true})).toBeEnabled();
 expect(requests).toBe(1);
});

test('leaving a running history check cancels it without marking the store offline',async({page,context})=>{
 await fixture(context);let release;
 await page.addInitScript(()=>{
  window.connectionEvents=[];
  window.addEventListener('partcast:connection',event=>window.connectionEvents.push(event.detail));
 });
 await context.route('http://localhost:10000/api/forecast/readiness**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  await new Promise(resolve=>{release=resolve;});
  await route.abort('aborted');
 });
 try {
  await page.goto('/forecast');
  await expect(page.getByText('Preparing sales data…',{exact:true})).toBeVisible();
  await expect.poll(()=>typeof release).toBe('function');
  await page.evaluate(()=>{window.connectionEvents=[];});
  await page.getByRole('link',{name:'View sales',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Sales',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>window.connectionEvents.filter(value=>value===false))).toEqual([]);
 }finally{release?.();}
});

test('separate sales page works without the Python engine, filter dates and remain readable offline',async({page,context})=>{
 const api=await fixture(context);await page.setViewportSize({width:390,height:844});
 const queries=[],training=[];let offline=false;
 page.on('request',request=>{if(request.url().endsWith('/api/forecast/train')&&request.method()==='POST')training.push(request.postData());});
 await context.route('http://localhost:10000/api/forecast/status',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  await route.fulfill({json:{ready:false,message:'The fixture Python engine is unavailable.'},headers:{'access-control-allow-origin':'*'}});
 });
 await context.route('http://localhost:10000/api/data-quality',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  await route.fulfill({json:{actualDemandRows:1,importedTrainingRows:3},headers:{'access-control-allow-origin':'*'}});
 });
 await context.route('http://localhost:10000/api/forecast/recorded-sales**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  if(offline){await route.abort('internetdisconnected');return;}
  const params=new URL(route.request().url()).searchParams;queries.push(Object.fromEntries(params));
  const range=Boolean(params.get('from')),empty=params.get('from')==='2026-10-11';
  const rows=empty?[]:[{product_id:p1,part_number:'BP-001',description:'Toyota brake pad',unit:'pcs',recorded_quantity:range?5:55,sale_days:range?1:2,record_count:range?2:3,actual_records:1,imported_records:range?1:2,first_sale_date:range?'2026-10-12':'2020-01-02',last_sale_date:'2026-10-12'},...(!range?[{product_id:p2,part_number:'OIL-001',description:'Engine oil',unit:'L',recorded_quantity:1.25,sale_days:1,record_count:1,actual_records:0,imported_records:1,first_sale_date:'2026-10-10',last_sale_date:'2026-10-10'}]:[])];
  await route.fulfill({json:{mode:'recorded_sales',record_count:empty?0:range?2:4,part_count:rows.length,last_sale_date:empty?null:'2026-10-12',invalid_records:0,future_records:0,includes_forecasts:false,missing_days_filled:false,data:rows},headers:{'access-control-allow-origin':'*'}});
 });
 await page.goto('/sales');
 const panel=page.getByRole('region',{name:'Sales by part',exact:true});
 await expect(panel.getByRole('heading',{name:'Sales by part',exact:true})).toBeVisible();
 await expect(panel.getByRole('article').filter({hasText:'BP-001'})).toContainText('55 pcs');
 await expect(panel.getByRole('article').filter({hasText:'OIL-001'})).toContainText('1.25 L');
 await expect(page.getByRole('button',{name:'Update demand estimate',exact:true})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Plan ahead',exact:true})).toHaveCount(0);
 await panel.getByLabel('From date',{exact:true}).fill('2026-10-12');await panel.getByLabel('To date',{exact:true}).fill('2026-10-12');
 await panel.getByRole('button',{name:'Show sales',exact:true}).click();
 await expect(panel.getByRole('article').filter({hasText:'BP-001'})).toContainText('5 pcs');
 expect(queries.at(-1)).toEqual({from:'2026-10-12',to:'2026-10-12'});
 await panel.getByLabel('From date',{exact:true}).fill('2026-10-11');await panel.getByLabel('To date',{exact:true}).fill('2026-10-11');
 await panel.getByRole('button',{name:'Show sales',exact:true}).click();
 await expect(panel.getByText('No quantities were recorded in these dates.',{exact:true})).toBeVisible();
 await expect(panel.getByText('This does not mean there were no sales.',{exact:true})).toBeVisible();
 await panel.getByRole('button',{name:'All saved dates',exact:true}).click();
 await expect(panel.getByRole('article').filter({hasText:'BP-001'})).toContainText('55 pcs');
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 offline=true;api.disconnect(true);await context.setOffline(true);await page.reload();
 await expect(panel.getByText(/Saved copy from/)).toBeVisible();
 await expect(panel.getByRole('article').filter({hasText:'BP-001'})).toContainText('55 pcs');
 expect(training).toHaveLength(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('separate sales search and pagination work on desktop, tablet and mobile in Tagalog',async({page,context})=>{
 await fixture(context);await page.setViewportSize({width:1280,height:900});
 const rows=Array.from({length:12},(_,i)=>({product_id:'recorded-fixture-'+i,part_number:'SKU-'+String(i+1).padStart(3,'0'),description:'Fixture part '+(i+1),unit:null,recorded_quantity:i+1,sale_days:1,actual_records:0,imported_records:1,first_sale_date:'2026-10-12',last_sale_date:'2026-10-12'}));
 await context.route('http://localhost:10000/api/forecast/recorded-sales**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  await route.fulfill({json:{mode:'recorded_sales',record_count:12,part_count:12,last_sale_date:'2026-10-12',invalid_records:0,future_records:0,data:rows},headers:{'access-control-allow-origin':'*'}});
 });
 await page.goto('/sales');let panel=page.getByRole('region',{name:'Sales by part',exact:true});
 await expect(panel.getByRole('table',{name:'Sales by part',exact:true}).locator('tbody tr')).toHaveCount(10);
 await panel.getByRole('button',{name:'Next parts',exact:true}).click();
 await expect(panel.getByRole('table',{name:'Sales by part',exact:true}).locator('tbody tr')).toHaveCount(2);
 await panel.getByLabel('Find a recorded part').fill('SKU-001');
 await expect(panel.getByRole('table',{name:'Sales by part',exact:true}).locator('tbody tr')).toHaveCount(1);
 await expect(panel.getByRole('button',{name:'Previous parts',exact:true})).toBeDisabled();
 await page.getByLabel('Website language').selectOption('fil');
 panel=page.getByRole('region',{name:'Benta ayon sa piyesa',exact:true});
 await expect(panel.getByRole('heading',{name:'Benta ayon sa piyesa',exact:true})).toBeVisible();
 await expect(panel.getByRole('button',{name:'Ipakita ang mga benta',exact:true})).toBeVisible();
 for(const width of [1280,768,390]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await expect(panel.getByRole('article').filter({hasText:'SKU-001'})).toBeVisible();
});

test('simulated XGBoost demo shows its own metrics and leaves real forecasts unchanged',async({page,context})=>{
 await fixture(context);await page.setViewportSize({width:390,height:844});
 const calls=[];
 const metric={wape_percent:17.5,mae:3.07,rmse:5.08};
 const methods=Object.fromEntries(['direct_period_xgboost','recursive_xgboost','recent_average_28','sma_365'].map(m=>[m,{metrics:{...metric,wape_percent:m==='sma_365'?12.3:m==='recursive_xgboost'?47.36:17.5},window_count:18}]));
 await context.route('http://localhost:10000/api/forecast/demo/jobs**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  if(route.request().method()==='POST'){
   calls.push(route.request().postDataBuffer());
   await route.fulfill({status:202,json:{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',status:'running'},headers:{'access-control-allow-origin':'*'}});return;
  }
  await route.fulfill({json:{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',status:'completed',result:{dataset_type:'SIMULATED_DEMO',filename:'demo.xlsx',selected_method:'direct_period_xgboost',part_count:9,split_summary:{train:{start:'2024-10-15',end:'2026-06-16'},test:{start:'2026-08-16',end:'2026-10-14'}},validation:methods,test:methods,future_periods:[{part_number:'BP-001',start:'2026-10-15',end:'2026-11-13',predicted_units:3.5}]}},headers:{'access-control-allow-origin':'*'}});
 });
 await page.goto('/forecast-demo');
 const download=page.waitForEvent('download');await page.getByRole('link',{name:'Download demo Excel'}).click();
 const file=await download;expect(file.suggestedFilename()).toBe('PartCast_Forecasting_DEMO.xlsx');
 const sample=new ExcelJS.Workbook();await sample.xlsx.readFile(await file.path());
 expect(sample.getWorksheet('IMPORT_Train_5Col').rowCount).toBe(5491);expect(sample.getWorksheet('Validation_5Col').rowCount).toBe(541);expect(sample.getWorksheet('Test_5Col').rowCount).toBe(541);expect(sample.getWorksheet('SIMULATED_DEMAND')).toBeTruthy();
 await expect(page.getByRole('button',{name:'Test XGBoost demo',exact:true})).toBeDisabled();
 await page.getByLabel('Choose the capstone demo workbook').setInputFiles({name:'demo.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('stubbed-demo-request')});
 await page.getByRole('button',{name:'Test XGBoost demo',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Demo results · simulated sales only'})).toBeVisible();
 await expect(page.getByText('17.5%',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('12.3%',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('Root mean squared error (RMSE)',{exact:true})).toBeVisible();
 await expect(page.getByText(/A simple baseline performed better on this sample/)).toBeVisible();
 await expect(page.getByRole('table',{name:'Next 30 days · demo quantities'})).toContainText('BP-001');
 expect(calls).toHaveLength(1);
 expect(calls[0].toString()).toContain('demo.xlsx');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.setViewportSize({width:1280,height:900});
 await expect(page.getByRole('heading',{name:'Demo results · simulated sales only'})).toBeVisible();
 await page.getByLabel('Website language').selectOption('fil');
 await expect(page.getByRole('heading',{name:'Resulta ng demo · halimbawang benta lamang'})).toBeVisible();
});

test('an incomplete sales-history response keeps the demand page usable and cannot enable training',async({page,context})=>{
 await fixture(context);const errors=[];page.on('pageerror',error=>errors.push(error.message));let valid=false;
 await context.route('http://localhost:10000/api/forecast/readiness**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  await route.fulfill({json:valid?{ready:false,status:'no_observations',record_count:0,current_part_count:0,products:[],requirements:{sale_days:5,calendar_days:35,maximum_age_days:31}}:{ready:true},headers:{'access-control-allow-origin':'*'}});
 });
 await page.goto('/forecast');await expect(page.getByRole('heading',{name:'Plan ahead',exact:true})).toBeVisible();await expect(page.getByText('The sales-history response was incomplete. Check again or ask your Super Admin to update the API.')).toBeVisible();
 await expect(page.getByRole('button',{name:'Update demand estimate',exact:true})).toBeDisabled();
 valid=true;await page.getByRole('button',{name:'Refresh sales data',exact:true}).click();await expect(page.getByText('Record or import actual sales first.',{exact:true})).toBeVisible();expect(errors).toEqual([]);
});
test('password is required before Gmail email code; wrong code cannot open the store',async({page,context})=>{
 const calls=[],passwords=[];let verified=false;
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
 await context.route('http://localhost:10000/**',async route=>{
 const req=route.request(),url=new URL(req.url());if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
 let json={needsSetup:false,data:[]},status=200;
 if(url.pathname==='/api/me'){status=verified?200:428;json=verified?{user:{id:userId,full_name:'Store Staff',role:'owner',active:true,session_id:sid,verification_expires_at:'2099-01-01T00:00:00Z'}}:{error:'Enter the email code to finish signing in.',code:'OTP_REQUIRED'};}
 else if(url.pathname==='/auth/otp/request'){calls.push({path:url.pathname,body:req.postDataJSON()});json={sent:true};}
 else if(url.pathname==='/auth/otp/verify'){calls.push({path:url.pathname,body:req.postDataJSON()});verified=req.postDataJSON().code==='654321';status=verified?200:422;json=verified?{verified:true}:{error:'The code is incorrect. Check your most recent email.'};}
 else if(url.pathname==='/api/dashboard')json={metrics:{totalProducts:0,lowStock:0,outOfStock:0,inventoryValue:0},salesTrend:[],fastMoving:[],slowMoving:[],reorder:[]};
 else if(url.pathname==='/api/offline-snapshot')json={products:[],suppliers:[]};
 await route.fulfill({status,json,headers});
 });
 await context.route(`https://${project}.supabase.co/**`,async route=>{
 const req=route.request();if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
 if(req.url().includes('/token')){passwords.push(req.postDataJSON());const ok=req.postDataJSON().password==='test-only-correct-password';await route.fulfill({status:ok?200:400,json:ok?{access_token:token,refresh_token:'test-only-refresh',expires_in:3600,token_type:'bearer',user:{id:userId,email:'staff@example.test',aud:'authenticated'}}:{msg:'Invalid login credentials'},headers});return;}
 await route.fulfill({json:{},headers});
 });
 await page.goto('/counter');await expect(page.getByLabel('Password',{exact:true})).toBeVisible();await expect(page.getByLabel('Email sign-in code')).toHaveCount(0);
 await page.getByLabel('Email address',{exact:true}).fill('staff@example.test');await page.getByLabel('Password',{exact:true}).fill('wrong-password');await page.getByRole('button',{name:'Sign in securely'}).click();await expect(page.getByRole('alert')).toBeVisible();expect(calls).toHaveLength(0);
 await page.getByLabel('Password',{exact:true}).fill('test-only-correct-password');await page.getByRole('button',{name:'Sign in securely'}).click();await expect(page.getByLabel('Email sign-in code')).toBeVisible();await expect.poll(()=>calls.length).toBe(1);await expect(page.getByRole('button',{name:/Resend in/})).toBeDisabled();expect(calls[0].path).toBe('/auth/otp/request');expect(calls[0].body).toEqual({});
 await page.getByLabel('Email sign-in code').fill('123456');await page.getByRole('button',{name:'Verify code and sign in'}).click();await expect(page.getByRole('alert')).toContainText('code is incorrect');await expect(page.locator('main')).toHaveCount(0);
 await page.getByLabel('Email sign-in code').fill('654321');await page.getByRole('button',{name:'Verify code and sign in'}).click();await expect(page.getByRole('heading',{name:'Hello, Store'})).toBeVisible();expect(passwords).toHaveLength(2);expect(calls.at(-1).body).toEqual({code:'654321'});
});

test('saved part photos open a gallery and remain available offline',async({page,context})=>{
 const api=await fixture(context);api.products[0].photo_paths=[`${p1}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp`,`${p1}/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp`];
 await page.setViewportSize({width:390,height:844});await page.goto('/inventory');await expect(page.getByText(/Inventory saved/)).toBeVisible();
 await page.getByRole('button',{name:'View photos of Toyota brake pad'}).click();await expect(page.getByRole('dialog').locator('img')).toHaveCount(2);await expect.poll(()=>page.getByRole('dialog').locator('img').evaluateAll(xs=>xs.every(x=>x.complete&&x.naturalWidth>0))).toBe(true);
 await page.getByRole('button',{name:'Close modal'}).click();await page.evaluate(async()=>navigator.serviceWorker.ready);api.disconnect(true);await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'View photos of Toyota brake pad'}).click();await expect(page.getByRole('dialog').locator('img')).toHaveCount(2);await expect.poll(()=>page.getByRole('dialog').locator('img').evaluateAll(xs=>xs.every(x=>x.complete&&x.naturalWidth>0))).toBe(true);
});
test('camera denial explains how to use manual barcode entry',async({page,context})=>{
 await context.addInitScript(()=>{Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw new DOMException('Denied','NotAllowedError');}});});
 await fixture(context);await page.goto('/counter');await page.getByRole('button',{name:'Scan',exact:true}).click();await page.getByRole('button',{name:'Use camera'}).click();await expect(page.getByRole('alert')).toContainText('Camera unavailable');await page.getByLabel('Barcode number').fill('123456789012');await page.getByRole('button',{name:'Find this barcode'}).click();await expect(page.getByLabel('Quantity',{exact:true})).toHaveValue('1');
});
test('dated sales export validates ranges and downloads an actual Excel workbook',async({page,context})=>{
 await fixture(context);const requests=[];const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('Sales total');sheet.addRow(['Sale lines','Total sales (PHP)']);sheet.addRow([2,600]);const bytes=Buffer.from(await workbook.xlsx.writeBuffer());
 await context.route('http://localhost:10000/api/reports/**',route=>{requests.push(new URL(route.request().url()));return route.fulfill({body:bytes,contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',headers:{'access-control-allow-origin':'*'}});});
 await page.goto('/reports');await page.getByLabel('Start date').fill('2026-10-10');await page.getByLabel('End date').fill('2026-10-01');await page.getByRole('button',{name:'Download Excel: Sales totals'}).click();await expect(page.getByRole('alert')).toContainText('Start date must');expect(requests).toHaveLength(0);
 await page.getByLabel('Start date').fill('2026-10-01');await page.getByLabel('End date').fill('2026-10-10');await page.getByLabel('Category').selectOption('parts');const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download Excel: Sales totals'}).click()]);expect(download.suggestedFilename()).toBe('sales-2026-10-01-2026-10-10.xlsx');expect(requests[0].searchParams.get('category')).toBe('parts');expect(requests[0].searchParams.get('from')).toBe('2026-10-01');const result=new ExcelJS.Workbook();await result.xlsx.readFile(await download.path());expect(result.getWorksheet('Sales total').getCell('B2').value).toBe(600);
});
test('sales and customer balances fit phone tablet and desktop screens',async({page,context})=>{
 const api=await fixture(context);api.debts.push({id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',customer_name:'Sample Customer',principal:500,paid_amount:100,balance:400,due_date:'2026-11-01',status:'open'});
 for(const width of [320,820,1440]){await page.setViewportSize({width,height:900});for(const route of ['/counter','/debts']){await page.goto(route);await expect(page.getByRole('heading',{name:route==='/counter'?'Sell or receive':'Customer utang',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}}
});

test('receive a multi-part delivery and add an existing past-due customer balance',async({page,context})=>{
 const api=await fixture(context);await page.goto('/counter?mode=stock_in');await expect(page.getByText(/Inventory saved/)).toBeVisible();await page.getByRole('button',{name:'Add Toyota brake pad to basket'}).click();await page.getByRole('button',{name:'Add Engine oil to basket'}).click();await page.getByLabel('Quantity',{exact:true}).nth(0).fill('2');await page.getByRole('button',{name:'3. Confirm delivery'}).click();await expect.poll(()=>api.batches.length).toBe(1);expect(api.batches[0].tx_type).toBe('stock_in');expect(api.products.map(p=>p.current_stock)).toEqual([7,9]);expect(api.debts).toHaveLength(0);
 await page.goto('/debts');await page.getByRole('button',{name:'Add existing utang'}).click();await page.getByLabel('Customer name *').fill('Existing Customer');await page.getByLabel('Amount still owed').fill('125.5');await page.getByLabel('Due date').fill('2020-01-01');await page.getByRole('button',{name:'Save utang'}).click();await expect(page.getByRole('heading',{name:'Existing Customer'})).toBeVisible();await expect(page.getByRole('article').filter({hasText:'Existing Customer'})).toContainText('Past due');expect(api.debts[0].balance).toBe(125.5);
});

test('temporary API failure retains one basket and retries its original operation',async({page,context})=>{
 const api=await fixture(context);const attempts=[];let available=false;
 await context.route('http://localhost:10000/api/inventory/batch',async route=>{if(route.request().method()==='OPTIONS'){await route.fallback();return;}attempts.push(route.request().postDataJSON());if(available){await route.fallback();return;}await route.fulfill({status:503,json:{error:'Store server is starting.'},headers:{'access-control-allow-origin':'*'}});});
 await page.setViewportSize({width:390,height:844});await page.goto('/counter');await expect(page.getByText(/Inventory saved/)).toBeVisible();await page.getByRole('button',{name:'Add Toyota brake pad to basket'}).click();await page.getByRole('link',{name:'Review basket'}).click();await page.getByLabel('Quantity',{exact:true}).fill('5');await page.getByRole('button',{name:'3. Confirm sale'}).click();await expect(page.getByText(/1 unsent transaction/)).toBeVisible();await expect(page.getByText('Tap a part to add it here.')).toBeVisible();expect(api.batches).toHaveLength(0);available=true;await page.getByRole('button',{name:'Send changes'}).click();await expect.poll(()=>api.batches.length,{timeout:15000}).toBe(1);expect(new Set(attempts.map(b=>b.client_operation_id)).size).toBe(1);expect(api.products[0].current_stock).toBe(0);
});

test('Cashier sees only selling and read-only inventory, including whole photo previews',async({page,context})=>{
 const api=await fixture(context,{role:'cashier'});api.products[0].photo_paths=[`${p1}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp`];
 await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page).toHaveURL(/counter/);await expect(page.getByRole('heading',{name:'Sell or receive',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'View photos of Toyota brake pad'}).click();await expect(page.getByRole('dialog').locator('img')).toHaveCount(1);expect(await page.getByRole('dialog').locator('img').evaluate(img=>getComputedStyle(img).objectFit)).toBe('contain');await page.getByRole('button',{name:'Close modal'}).click();
 await page.getByRole('button',{name:'More pages'}).click();const nav=page.getByRole('dialog',{name:'All pages'});await expect(nav.getByRole('link',{name:/Demand planning|Reports|Settings|Customer utang|^Sales/})).toHaveCount(0);await page.getByRole('button',{name:'Close navigation'}).click();
 await page.goto('/inventory');await expect(page.getByRole('heading',{name:'Inventory',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Add a new part'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Edit details'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Adjust stock'})).toHaveCount(0);await expect(page.getByText(/View only/).filter({visible:true})).toHaveCount(2);
 for(const path of ['/reports','/debts','/forecast','/forecast-demo','/sales','/it-settings','/users']){await page.goto(path);await expect(page).toHaveURL(/counter/);}
 expect(api.productWrites).toHaveLength(0);
});
test('Owner cannot open IT settings; Super Admin can change masked Google credentials',async({page,context})=>{
 await fixture(context);await page.goto('/it-settings');await expect(page).toHaveURL(/\/$/);await expect(page.getByRole('heading',{name:'IT settings',exact:true})).toHaveCount(0);
 await context.route('http://localhost:10000/api/me',route=>route.fulfill({json:{user:{id:userId,full_name:'Store IT',role:'super_admin',active:true,session_id:sid,verification_expires_at:'2099-01-01T00:00:00Z'}},headers:{'access-control-allow-origin':'*'}}));
 const changes=[];const rows=[{provider:'gmail',enabled:true,ready:true,sender_email:'sender@example.test',fields:{client_id:true,client_secret:true,refresh_token:true,sender_email:true}},{provider:'gemini',enabled:true,ready:true,model:'gemini-2.5-flash',fields:{api_key:true,model:true}}];
 await context.route('http://localhost:10000/api/admin/integrations**',async route=>{if(route.request().method()==='OPTIONS')return route.fallback();if(route.request().method()==='PATCH'){changes.push(route.request().postDataJSON());await route.fulfill({json:{data:rows[1]},headers:{'access-control-allow-origin':'*'}});return;}await route.fulfill({json:{data:rows,forecasting:{ready:true,message:'The forecasting engine is ready.'}},headers:{'access-control-allow-origin':'*'}});});
 await page.setViewportSize({width:320,height:840});await page.goto('/it-settings');await expect(page.getByRole('heading',{name:'IT settings',exact:true})).toBeVisible();await expect(page.getByLabel('Google client secret')).toHaveValue('');await expect(page.getByLabel('Google refresh token')).toHaveValue('');await expect(page.getByLabel('Gemini API key')).toHaveValue('');
 await page.getByLabel('Gemini API key').fill('test-only-replacement');await page.getByRole('heading',{name:'Gemini chatbot'}).locator('..').locator('..').getByRole('button',{name:'Save connection',exact:true}).click();await expect.poll(()=>changes.length).toBe(1);expect(changes[0].api_key).toBe('test-only-replacement');await expect(page.getByLabel('Gemini API key')).toHaveValue('');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('stock notifications refresh after stock changes and failed read marking offers retry',async({page,context})=>{
 await fixture(context);let stock=1,marked=false,fail=true;
 await context.route('http://localhost:10000/api/notifications**',async route=>{const headers={'access-control-allow-origin':'*'};if(route.request().method()==='OPTIONS')return route.fallback();if(route.request().method()==='POST'){if(fail){await route.fulfill({status:503,json:{error:'Please retry marking this alert.'},headers});return;}marked=true;await route.fulfill({json:{ok:true},headers});return;}await route.fulfill({json:{data:stock<=1?[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',kind:stock?'low':'out',read:marked,created_at:'2026-10-10T02:00:00Z',product:{description:'Toyota brake pad',current_stock:stock,minimum_stock:2,unit:'pcs'}}]:[]},headers});});
 await page.goto('/inventory');await page.getByRole('button',{name:/Stock notifications/}).click();await expect(page.getByRole('dialog')).toContainText('Running low: Toyota brake pad');await page.getByRole('button',{name:'Mark as read'}).click();await expect(page.getByRole('alert')).toContainText('retry');fail=false;await page.getByRole('button',{name:'Mark as read'}).click();await expect(page.getByRole('button',{name:'Mark as read'})).toHaveCount(0);
 stock=0;await page.evaluate(()=>window.dispatchEvent(new Event('partcast:queue')));await expect(page.getByRole('dialog')).toContainText('Out of stock: Toyota brake pad');stock=5;await page.evaluate(()=>window.dispatchEvent(new Event('partcast:queue')));await expect(page.getByRole('dialog')).toContainText('No stock alerts to show');
});

test('stock alerts prioritize urgency, filter by status and part, preserve read stock issues and work offline',async({page,context})=>{
 const fixtureApi=await fixture(context);await page.setViewportSize({width:390,height:844});let offline=false;const marked=[];
 const alerts=[{id:'low',kind:'low',read:false,created_at:'2026-10-17T01:00:00Z',product:{part_number:'OIL-001',description:'Engine oil',current_stock:1,minimum_stock:2,unit:'bottles'}},{id:'out-read',kind:'out',read:true,created_at:'2026-10-17T02:00:00Z',product:{part_number:'FILTER-001',description:'Air filter',current_stock:0,minimum_stock:3,unit:'pcs'}},{id:'out-new',kind:'out',read:false,created_at:'2026-10-17T03:00:00Z',product:{part_number:'BP-001',description:'Toyota brake pad',current_stock:0,minimum_stock:2,unit:'pcs'}}];
 await context.route('http://localhost:10000/api/notifications**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();if(offline)return route.abort('internetdisconnected');
  if(route.request().method()==='POST'){const id=new URL(route.request().url()).pathname.split('/')[3];marked.push(id);alerts.find(row=>row.id===id).read=true;return route.fulfill({json:{ok:true},headers:{'access-control-allow-origin':'*'}});}
  return route.fulfill({json:{data:alerts},headers:{'access-control-allow-origin':'*'}});
 });
 await page.goto('/inventory');await page.getByRole('button',{name:/Stock notifications/}).click();const dialog=page.getByRole('dialog',{name:'Stock notifications'});
 await expect(dialog.getByRole('article').first()).toContainText('Toyota brake pad');
 const filters=dialog.getByRole('group',{name:'Filter stock alerts'});
 await filters.getByRole('button',{name:'Unread',exact:true}).click();await expect(dialog.getByRole('article')).toHaveCount(2);
 await dialog.getByRole('article').first().getByRole('button',{name:'Mark as read'}).click();await expect(dialog.getByRole('article')).toHaveCount(1);expect(marked).toEqual(['out-new']);
 await filters.getByRole('button',{name:'All alerts',exact:true}).click();await expect(dialog.getByRole('article')).toHaveCount(3);
 await dialog.getByLabel('Find a stock alert').fill('BP-001');await expect(dialog.getByRole('article')).toHaveCount(1);await expect(dialog.getByRole('article')).toContainText('Read');
 await dialog.getByLabel('Find a stock alert').fill('not-a-part');await expect(dialog.getByText('No alerts match this view.')).toBeVisible();await dialog.getByRole('button',{name:'Show all alerts'}).click();
 await page.screenshot({path:'test-results/alerts-mobile.png'});
 for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.screenshot({path:'test-results/alerts-desktop.png'});
 await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:/Stock notifications/})).toBeFocused();
 await page.getByLabel('Website language').selectOption('fil');await page.getByRole('button',{name:'Laki ng text at kulay'}).click();await page.getByRole('button',{name:'Gamitin ang dark mode'}).click();await page.getByRole('button',{name:'Tapos na',exact:true}).click();
 await page.getByRole('button',{name:/Mga abiso sa stock/}).click();await expect(page.getByRole('dialog')).toContainText('Bagong abiso');await page.keyboard.press('Escape');
 offline=true;fixtureApi.disconnect(true);await context.setOffline(true);await page.getByRole('button',{name:/Mga abiso sa stock/}).click();await expect(page.getByRole('dialog')).toContainText('Mga naka-save na abiso');
 await expect(page.getByRole('dialog').getByRole('button',{name:'Markahang nabasa na'})).toBeDisabled();
});

test('every application page opens on phone tablet and desktop without page errors',async({page,context})=>{
 test.setTimeout(120000);await fixture(context,{role:'super_admin'});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const paths=['/','/counter','/inventory','/forecast','/forecast?demo=1','/forecast-demo','/sales','/sales?source=counter','/sales?source=imported','/reorder','/reports','/imports','/debts','/transactions','/backups','/users','/settings','/account','/it-settings'];
 for(const width of [390,768,1280]){
  await page.setViewportSize({width,height:900});
  for(const path of paths){await page.goto(path);await expect(page.getByRole('main')).toBeVisible();await expect(page.getByRole('main').getByRole('heading',{level:1})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${path} at ${width}px`).toBe(true);}
 }
 expect(errors).toEqual([]);
});

test('offline sale survives an expired email check and sends after re-verification',async({page,context})=>{
 const store=await fixture(context);let needsCode=false;
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
 for(const path of ['/api/me','/api/inventory/batch'])await context.route('http://localhost:10000'+path,async route=>{if(route.request().method()==='OPTIONS')return route.fallback();if(!needsCode)return route.fallback();await route.fulfill({status:428,json:{code:'OTP_REQUIRED',error:'Enter the email code to finish signing in.'},headers});});
 await context.route('http://localhost:10000/auth/**',async route=>{if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}if(route.request().url().endsWith('/otp/verify'))needsCode=false;await route.fulfill({json:{sent:true,verified:true},headers});});
 await page.goto('/counter');await expect(page.getByText(/Inventory saved/)).toBeVisible();await page.evaluate(async()=>navigator.serviceWorker.ready);store.disconnect(true);await context.setOffline(true);await page.getByRole('button',{name:'Add Toyota brake pad to basket'}).click();await page.getByLabel('Quantity',{exact:true}).fill('2');await page.getByRole('button',{name:'3. Confirm sale'}).click();await expect(page.getByText(/1 unsent transaction/)).toBeVisible();
 needsCode=true;store.disconnect(false);await context.setOffline(false);await expect(page.getByLabel('Email sign-in code')).toBeVisible({timeout:15000});
 const waiting=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('partcast-offline-v1');r.onsuccess=()=>{const request=r.result.transaction('queue').objectStore('queue').getAll();request.onsuccess=()=>resolve(request.result);};}));expect(waiting).toHaveLength(1);expect(waiting[0].status).toBe('pending');
 await page.getByLabel('Email sign-in code').fill('654321');await page.getByRole('button',{name:'Verify code and sign in'}).click();await expect.poll(()=>store.batches.length,{timeout:15000}).toBe(1);expect(store.batches[0].client_operation_id).toBe(waiting[0].payload.client_operation_id);expect(store.products[0].current_stock).toBe(3);
});


test('counter sales have their own dated, paginated list and preserve fractional quantities',async({page,context})=>{
 await fixture(context);const queries=[];let fail=false;
 await context.route('http://localhost:10000/api/transactions**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  const params=new URL(route.request().url()).searchParams;queries.push(Object.fromEntries(params));
  const range=params.has('from'),second=params.get('page')==='2';
  const data=Array.from({length:range?1:second?1:25},(_,i)=>({id:'sale-'+i,tx_type:'sale',quantity:1.25,total_amount:125.5,customer_name:'Juan',reference_no:'COUNTER-01',occurred_at:'2026-10-12T04:00:00Z',product:{part_number:'OIL-001',description:'Engine oil',unit:'L'}}));
  await route.fulfill({status:fail?503:200,json:fail?{error:'Sales server unavailable.'}:{data,count:range?1:26},headers:{'access-control-allow-origin':'*'}});
 });
 await page.setViewportSize({width:390,height:844});await page.goto('/sales?source=counter');
 let panel=page.getByRole('region',{name:'Counter sales',exact:true});
 await expect(panel.getByText('Sales entries: 26')).toBeVisible();await expect(panel.getByRole('article')).toHaveCount(25);
 await expect(panel.getByRole('article').first()).toContainText('1.25 L');await expect(panel.getByRole('article').first()).toContainText('125.50');await expect(panel.getByRole('article').first()).toContainText('Juan');
 await panel.getByRole('button',{name:'Next',exact:true}).click();await expect(panel.getByRole('article')).toHaveCount(1);expect(queries.at(-1).page).toBe('2');
 await panel.getByLabel('From date',{exact:true}).fill('2026-10-12');await panel.getByLabel('To date',{exact:true}).fill('2026-10-12');await panel.getByRole('button',{name:'Find sales'}).click();
 await expect(panel.getByText('Sales entries: 1')).toBeVisible();expect(queries.at(-1)).toEqual({page:'1',pageSize:'25',type:'sale',from:'2026-10-12',to:'2026-10-12'});
 await panel.getByRole('button',{name:'Clear filters'}).click();await expect(panel.getByText('Sales entries: 26')).toBeVisible();expect(queries.at(-1)).toEqual({page:'1',pageSize:'25',type:'sale'});
 fail=true;await panel.getByRole('button',{name:'Refresh history'}).click();await expect(panel.getByRole('heading',{name:'Sales could not be loaded'})).toBeVisible();await expect(panel.getByRole('article')).toHaveCount(0);
 fail=false;await panel.getByRole('button',{name:'Try again'}).click();await expect(panel.getByText('Sales entries: 26')).toBeVisible();
 await page.getByLabel('Website language').selectOption('fil');panel=page.getByRole('region',{name:'Benta sa counter',exact:true});await expect(panel.getByText('Mga tala ng benta: 26')).toBeVisible();
 for(const width of [320,768,1280]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),String(width)).toBe(true);}
 await expect(panel.getByRole('table')).toContainText('1.25 L');
 expect(queries.every(query=>query.type==='sale')).toBe(true);
});

test('inventory staff can read counter sales but cannot request manager-only sales sources or the demo',async({page,context})=>{
 await fixture(context,{role:'inventory_staff'});const protectedCalls=[];
 page.on('request',request=>{if(/\/api\/(imports\/sales|forecast\/(recorded-sales|demo))/.test(request.url()))protectedCalls.push(request.url());});
 for(const path of ['/sales','/sales?source=imported']){await page.goto(path);await expect(page.getByRole('region',{name:'Counter sales',exact:true})).toBeVisible();await expect(page.getByRole('navigation',{name:'Sales sources'})).toHaveCount(0);}
 await page.goto('/forecast-demo');await expect(page).toHaveURL(/\/$/);expect(protectedCalls).toEqual([]);
});

test('a separate demo database uses the usual planning page while keeping generated data identified',async({page,context})=>{
 await fixture(context);await page.setViewportSize({width:390,height:844});let trained=false;
 const headers={'access-control-allow-origin':'*'};
 const intercept=(path,handler)=>context.route('http://localhost:10000'+path,route=>route.request().method()==='OPTIONS'?route.fallback():handler(route));
 await intercept('/api/me',route=>route.fulfill({json:{user:{id:userId,full_name:'Store Staff',role:'owner',active:true,session_id:sid,verification_expires_at:'2099-01-01T00:00:00Z',data_environment:'simulated_demo'}},headers}));
 await intercept('/api/data-quality',route=>route.fulfill({json:{dataMode:'simulated_demo',demoDemandRows:778,demoHistoryDays:730,actualDemandRows:0,importedTrainingRows:0},headers}));
 await intercept('/api/forecast/status',route=>route.fulfill({json:{ready:true},headers}));
 await intercept('/api/forecast/readiness**',route=>route.fulfill({json:{ready:true,status:'ready',record_count:778,current_part_count:9,products:[],requirements:{sale_days:5,calendar_days:35,maximum_age_days:31}},headers}));
 await intercept('/api/forecast/runs',route=>route.fulfill({json:{data:trained?[{id:'run-demo',status:'completed',completed_at:'2026-10-17T00:00:00Z',metrics:{data_mode:'simulated_demo',production_accuracy_established:false}}]:[]},headers}));
 await intercept('/api/forecast/products',route=>route.fulfill({json:{run:trained?{id:'run-demo'}:null,data:trained?[{product_id:p1,part_number:'23303-64010',description:'FUEL FILTER',predicted_total:8,forecast_days:30}]:[]},headers}));
 await intercept('/api/forecast/product/*',route=>route.fulfill({json:{data:[{run_id:'run-demo',forecast_date:'2026-10-18',predicted_quantity:0.25}]},headers}));
 await intercept('/api/forecast/train',route=>{expect(route.request().postDataJSON()).toEqual({horizonDays:30,includeProxy:false});trained=true;return route.fulfill({json:{forecastCount:270},headers});});
 await intercept('/api/forecast/recorded-sales**',route=>route.fulfill({json:{mode:'simulated_demo',record_count:778,part_count:9,last_sale_date:'2026-10-16',data:[{product_id:p1,part_number:'23303-64010',description:'FUEL FILTER',unit:'pcs',recorded_quantity:12,demo_records:40,actual_records:0,imported_records:0,sale_days:40,first_sale_date:'2024-10-17',last_sale_date:'2026-10-16'}]},headers}));
 await page.goto('/forecast');await expect(page.getByText('Demo demand records',{exact:true}).filter({visible:true})).toBeVisible();await expect(page.getByText('778',{exact:true}).filter({visible:true})).toBeVisible();await expect(page.getByText(/walkthrough estimates demand from generated quantities/)).toBeVisible();
 await expect(page.getByText('Actual quantities from imported sales',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Update demand estimate',exact:true}).click();await expect(page.getByLabel('Choose a part')).toContainText('23303-64010');await page.getByRole('button',{name:'Daily list',exact:true}).click();await expect(page.getByRole('table').filter({hasText:'Estimated units sold'})).toContainText('0.3');
 await page.goto('/sales');await expect(page.getByText('Generated sample records: 40',{exact:true}).filter({visible:true})).toBeVisible();await expect(page.getByText('Generated sample quantities in the separate demo database.')).toBeVisible();
 for(const width of [320,768,1280]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),String(width)).toBe(true);}
 await page.getByLabel('Website language').selectOption('fil');await expect(page.getByText('Mga ginawang halimbawang dami sa hiwalay na demo database.')).toBeVisible();
});

test('Gmail code delivery failures stay on the email step, show the cause and recover after correction',async({page,context})=>{
 await fixture(context);await page.setViewportSize({width:390,height:844});let broken=true,requests=0;
 const headers={'access-control-allow-origin':'*'};
 await context.route('http://localhost:10000/api/me',route=>route.request().method()==='OPTIONS'?route.fallback():route.fulfill({status:428,json:{error:'Enter the email code to finish signing in.',code:'OTP_REQUIRED'},headers}));
 await context.route('http://localhost:10000/auth/otp/request',route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();requests++;
  return route.fulfill({status:broken?503:200,json:broken?{error:'Google rejected the Gmail client ID or client secret. Ask the Super Admin to check the matching Google OAuth credentials.',code:'GMAIL_OAUTH_INVALID_CLIENT'}:{sent:true},headers});
 });
 await page.goto('/counter');await expect(page.getByRole('heading',{name:'Check your email',exact:true})).toBeVisible();
 await expect(page.getByRole('alert')).toContainText('client ID or client secret');await expect(page.getByRole('button',{name:'Send email code',exact:true})).toBeEnabled();
 await expect(page.getByText('Your password is correct. Request an email code to finish signing in.')).toBeVisible();await expect(page.getByText('Request a code first. If sending fails, check the message above.')).toBeVisible();
 await expect(page.getByText('Check your inbox and spam folder. Enter the code from your most recent email.')).toHaveCount(0);await expect(page.getByText('Ask your Super Admin to check Gmail settings if an email code cannot be sent.')).toBeVisible();await expect(page.getByRole('main')).toHaveCount(0);
 await page.getByLabel('Website language').selectOption('fil');await expect(page.getByRole('alert')).toContainText('Tinanggihan ng Google');await page.getByLabel('Wika ng website').selectOption('en');
 expect(requests).toBe(1);broken=false;await page.getByRole('button',{name:'Send email code',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByText('Check your inbox and spam folder. Enter the code from your most recent email.')).toBeVisible();await expect(page.getByRole('button',{name:/Resend in/})).toBeDisabled();expect(requests).toBe(2);await expect(page.getByRole('main')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
