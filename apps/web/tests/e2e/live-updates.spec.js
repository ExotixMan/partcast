import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
const ExcelJS=createRequire(new URL('../../../server/package.json',import.meta.url))('exceljs');
const userId='11111111-1111-4111-8111-111111111111',p1='33333333-3333-4333-8333-333333333333',p2='99999999-9999-4999-8999-999999999999',project='ragdjkdcrvexqfadlqbf',supplier='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sid='77777777-7777-4777-8777-777777777777';
const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({session_id:sid,amr:[{method:'password'}]})).toString('base64url')+'.test-only-signature';
async function fixture(context,{role='owner'}={}){
 await context.addInitScript(({userId,project,token})=>localStorage.setItem(`sb-${project}-auth-token`,JSON.stringify({access_token:token,refresh_token:'test-only-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:userId,email:'staff@example.test',aud:'authenticated'}})),{userId,project,token});
 const products=[{id:p1,part_number:'BP-001',description:'Toyota brake pad',brand:'Toyota',unit:'pcs',location:'Shelf A',current_stock:5,minimum_stock:1,safety_stock:1,selling_price:500,unit_cost:100,category:'parts',barcode:'123456789012',search_aliases:['pastilyas'],photo_paths:[],stock_status:'ok'},{id:p2,part_number:'OIL-001',description:'Engine oil',brand:'Brand',unit:'bottles',location:'Shelf B',current_stock:8,minimum_stock:2,selling_price:100,unit_cost:60,category:'lubricants',barcode:'987654321098',search_aliases:['langis ng makina'],photo_paths:[],stock_status:'ok'}];
 const batches=[],debts=[],payments=[],emails=[],productWrites=[],photoUploads=[],supplierLinks=[];let disconnected=false;const sales=[];const today='2026-10-31';const receipts=new Map();
 await context.route('http://localhost:10000/**',async route=>{
 const req=route.request(),url=new URL(req.url()),headers={'access-control-allow-origin':'*'};
 if(disconnected){await route.abort('internetdisconnected');return;}
 if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type'}});return;}
 let body={data:[]};
 if(url.pathname==='/api/me')body={user:{id:userId,full_name:'Store Staff',role,active:true,session_id:sid,verification_expires_at:'2099-01-01T00:00:00Z'}};
 else if(url.pathname==='/api/forecast/readiness')body={ready:false,status:'no_observations',record_count:0,current_part_count:0,latest_sale_date:null,products:[],requirements:{sale_days:5,calendar_days:35,maximum_age_days:31}};
 else if(url.pathname==='/api/offline-snapshot')body={products,suppliers:[{id:supplier,name:'Parts supplier'}]};
 else if(url.pathname==='/api/forecast/status')body={ready:true};
 else if(url.pathname==='/api/data-quality')body={actualDemandRows:sales.length};
 else if(url.pathname==='/api/forecast/runs')body={data:[{id:'run',status:'completed',started_at:today}]};
 else if(url.pathname==='/api/forecast/products')body={run:{id:'run'},data:products.map(p=>({...p,product_id:p.id,predicted_total:4,forecast_days:2}))};
 else if(url.pathname.startsWith('/api/forecast/product/')){const product=products.find(p=>p.id===url.pathname.split('/').at(-1));body={product,today,run:{id:'run'},actualSales:sales,data:[{run_id:'run',forecast_date:'2026-11-01',predicted_quantity:2},{run_id:'run',forecast_date:'2026-11-02',predicted_quantity:2}]};}
 else if(url.pathname==='/api/products'&&req.method()==='GET'){const q=(url.searchParams.get('q')||'').toLowerCase(),category=url.searchParams.get('category');const data=products.filter(p=>`${p.part_number} ${p.description} ${p.barcode} ${p.search_aliases.join(' ')}`.toLowerCase().includes(q)&&(!category||category==='all'||p.category===category));body={data,count:data.length};}
 else if(url.pathname==='/api/products'&&req.method()==='POST'){const payload=req.postDataJSON();productWrites.push(payload);body={product:{...payload,id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'}};}
 else if(url.pathname.startsWith('/api/products/')&&req.method()==='PATCH'){const changes=req.postDataJSON();productWrites.push(changes);const product=products.find(p=>p.id===url.pathname.split('/').at(-1));Object.assign(product,changes);body={product};}
 else if(url.pathname==='/api/inventory/batch'){
 const b=req.postDataJSON();batches.push(b);
 if(!receipts.has(b.client_operation_id)){for(const l of b.lines){products.find(p=>p.id===l.product_id).current_stock+=(b.tx_type==='sale'?-1:1)*l.quantity;if(b.tx_type==='sale')sales.push({occurred_on:today,quantity:l.quantity});}
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
 else if(url.pathname===`/api/suppliers/${supplier}/parts`&&req.method()==='POST'){const payload=req.postDataJSON();supplierLinks.push(payload);const product=products.find(p=>p.id===payload.product_id);body={data:{...product,product_id:product.id,supplier_id:supplier,supplier_name:'Parts supplier',supplier_email:'supplier@example.test',recommended_quantity:0,status:'ok'}};}
 else if(url.pathname==='/api/reorder')body={data:[{product_id:p1,part_number:'BP-001',description:'Toyota brake pad',unit:'pcs',supplier_id:supplier,supplier_name:'Parts supplier',supplier_email:'supplier@example.test',current_stock:1,recommended_quantity:5,status:'low_stock'},...(url.searchParams.get('onlyNeeded')==='false'?[{product_id:p2,part_number:'OIL-001',description:'Engine oil',unit:'bottles',supplier_id:supplier,supplier_name:'Parts supplier',supplier_email:'supplier@example.test',current_stock:8,recommended_quantity:0,status:'ok'}]:[])]};
 else if(url.pathname.startsWith('/api/admin/supplier-email/')){emails.push(req.postDataJSON());body={message:'Email sent',items:1};}
 else if(url.pathname.startsWith('/api/photos/')&&req.method()==='POST'){photoUploads.push(req.postData());products[0].photo_paths=[`${p1}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp`];body={photo_paths:products[0].photo_paths};}
 else if(url.pathname.startsWith('/api/photos/')&&req.method()==='DELETE'){products[0].photo_paths=[];body={photo_paths:[]};}
 else if(url.pathname.startsWith('/api/photos/')){await route.fulfill({body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'),contentType:'image/png',headers});return;}
 else if(url.pathname==='/api/dashboard')body={metrics:{totalProducts:2,lowStock:0,outOfStock:0,inventoryValue:980},salesTrend:[{day:'2026-10-29',revenue:40},{day:'2026-10-30',revenue:50},{day:today,revenue:sales.reduce((s,x)=>s+x.quantity*10,0)}],fastMoving:[],slowMoving:[],reorder:[]};
 await route.fulfill({json:body,headers});
 });
 return {batches,debts,payments,emails,products,productWrites,photoUploads,supplierLinks,disconnect:value=>{disconnected=value;}};
}

test('single-character suggestions and live planning graphs work across production tabs',async({page,context})=>{
 const api=await fixture(context);const planning=await context.newPage();
 const errors=[];for(const tab of [page,planning])tab.on('pageerror',e=>errors.push(e.message));
 await page.goto('/counter');await expect(page.getByText(/Inventory saved/)).toBeVisible();
 await planning.goto('/forecast');await expect(planning.getByText('On hand: 5 units',{exact:true})).toBeVisible();
 const search=page.getByRole('combobox',{name:'Find a part',exact:true});
 await search.fill('t');await expect(page.getByRole('listbox').getByRole('option').filter({hasText:'Toyota brake pad'})).toBeVisible();
 await search.fill('1');await expect(page.getByRole('listbox').getByRole('option').filter({hasText:'BP-001'})).toBeVisible();
 await search.press('ArrowDown');await search.press('Enter');await expect(search).toHaveValue('BP-001');await expect(page.getByRole('listbox')).toHaveCount(0);
 await search.fill('');await search.blur();
 const curve=planning.locator('.recharts-line').last().locator('path.recharts-line-curve');await expect(curve).toBeVisible();const initial=await curve.getAttribute('d');
 await page.getByRole('button',{name:'Receive delivery',exact:true}).click();await page.getByRole('button',{name:'Add Toyota brake pad to basket'}).click();
 await page.getByRole('button',{name:'3. Confirm delivery'}).click();await page.getByRole('button',{name:'Yes, receive these items',exact:true}).click();
 await expect.poll(()=>api.batches.length).toBe(1);await expect(planning.getByText('On hand: 6 units',{exact:true})).toBeVisible();await expect.poll(()=>curve.getAttribute('d')).not.toBe(initial);
 const restocked=await curve.getAttribute('d');
 await page.getByRole('button',{name:'Sell parts',exact:true}).click();await page.getByRole('button',{name:'Add Toyota brake pad to basket'}).click();await page.getByRole('button',{name:'3. Confirm sale'}).click();
 await expect.poll(()=>api.batches.length).toBe(2);await expect(planning.getByText('On hand: 5 units',{exact:true})).toBeVisible();await expect.poll(()=>curve.getAttribute('d')).not.toBe(restocked);
 await planning.getByLabel('Search by part number or name',{exact:true}).fill('e');await planning.getByRole('listbox').getByRole('option').filter({hasText:'Engine oil'}).click();await expect(planning.getByText('On hand: 8 units',{exact:true})).toBeVisible();
 await planning.goto('/');const trend=planning.locator('.recharts-line-curve');await expect(trend).toBeVisible();const oldTrend=await trend.getAttribute('d');
 await page.getByRole('button',{name:'Add Toyota brake pad to basket'}).click();await page.getByRole('button',{name:'3. Confirm sale'}).click();await expect.poll(()=>api.batches.length).toBe(3);await expect.poll(()=>trend.getAttribute('d')).not.toBe(oldTrend);
 await planning.goto('/forecast');await expect(planning.getByText('On hand: 4 units',{exact:true})).toBeVisible();
 await page.goto('/inventory');await page.setViewportSize({width:390,height:844});const inventorySearch=page.getByRole('combobox',{name:'Search inventory',exact:true});await inventorySearch.fill('t');await expect(page.getByRole('listbox').getByRole('option').filter({hasText:'Toyota brake pad'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);expect(errors).toEqual([]);
});
