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
 await page.getByLabel('Category',{exact:true}).selectOption('lubricants');await expect(page.getByText('Engine oil',{exact:true}).first()).toBeVisible();await expect(page.getByText('Toyota brake pad',{exact:true})).toHaveCount(0);
});
test('supplier review sends the edited message and quantities',async({page,context})=>{
 const api=await fixture(context);await page.goto('/reorder');await page.getByRole('button',{name:'Review supplier email'}).click();await page.getByLabel('Email subject *').fill('Our parts order');await page.getByLabel('Your message *').fill('Please deliver next week.');await page.getByLabel('Quantity *').fill('2.5');await page.getByLabel('Description *').fill('Toyota front brake pad');await page.getByRole('button',{name:'Send email to supplier'}).click();await expect.poll(()=>api.emails.length).toBe(1);expect(api.emails[0].message).toBe('Please deliver next week.');expect(api.emails[0].items[0].quantity).toBe(2.5);expect(api.emails[0].items[0].description).toBe('Toyota front brake pad');
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
 await fixture(context);await page.setViewportSize({width:390,height:844});await page.goto('/debts');await page.getByLabel('Website language').selectOption('fil');await expect(page.getByRole('heading',{name:'Utang ng customer'})).toBeVisible();await page.getByRole('button',{name:'Gamitin ang madilim na tema'}).click();expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');
 await page.reload();await expect(page.getByRole('heading',{name:'Utang ng customer'})).toBeVisible();expect(await page.locator('html').getAttribute('lang')).toBe('fil');expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Buksan ang katulong sa tindahan'}).click();await page.getByLabel('Mensahe sa katulong sa tindahan').fill('Pareho ba ang coolant at radiator?');await page.getByRole('button',{name:'Ipadala ang mensahe'}).click();await expect(page.getByText(/magkaibang produkto/)).toBeVisible();
});
test('part photos validate upload and show saved images',async({page,context})=>{
 const api=await fixture(context);await page.setViewportSize({width:390,height:844});await page.goto('/inventory');const card=page.getByRole('article').filter({hasText:'Toyota brake pad'});await card.getByRole('button',{name:'Edit details'}).click();
 await page.locator('input[type=file]').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('not an image')});await expect(page.getByRole('alert')).toContainText('JPEG');expect(api.photoUploads).toHaveLength(0);
 await page.locator('input[type=file]').setInputFiles({name:'part.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});await expect.poll(()=>api.photoUploads.length).toBe(1);await expect(page.getByRole('dialog').locator('img')).toBeVisible();await page.getByRole('button',{name:'Remove photo'}).click();await expect(page.getByRole('dialog').locator('img')).toHaveCount(0);
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
 await page.getByRole('button',{name:'More pages'}).click();const nav=page.getByRole('dialog',{name:'All pages'});await expect(nav.getByRole('link',{name:/Demand planning|Reports|Settings|Customer utang/})).toHaveCount(0);await page.getByRole('button',{name:'Close navigation'}).click();
 await page.goto('/inventory');await expect(page.getByRole('heading',{name:'Inventory',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Add a new part'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Edit details'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Adjust stock'})).toHaveCount(0);await expect(page.getByText(/View only/).filter({visible:true})).toHaveCount(2);
 for(const path of ['/reports','/debts','/forecast','/it-settings','/users']){await page.goto(path);await expect(page).toHaveURL(/counter/);}
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
