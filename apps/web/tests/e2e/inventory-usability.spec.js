import {test,expect} from '@playwright/test';

const userId='11111111-1111-4111-8111-111111111111';
const sessionId='77777777-7777-4777-8777-777777777777';
const project='ragdjkdcrvexqfadlqbf';
const partId='33333333-3333-4333-8333-333333333333';

async function inventoryFixture(context) {
 const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({session_id:sessionId,amr:[{method:'password'}]})).toString('base64url')+'.test-only-signature';
 await context.addInitScript(({project,userId,token})=>localStorage.setItem(`sb-${project}-auth-token`,JSON.stringify({access_token:token,refresh_token:'test-only-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:userId,email:'staff@example.test',aud:'authenticated'}})),{project,userId,token});
 const products=[{id:partId,description:'Toyota brake pad',part_number:'BP-001',barcode:'BOX-001',category:'parts',brand:'Toyota',unit:'pc',location:'Shelf A',current_stock:5,minimum_stock:1,safety_stock:1,selling_price:125.50,unit_cost:75,search_aliases:['pastilyas'],photo_paths:[],stock_status:'ok',active:true}];
 const writes=[],movements=[];
 await context.route('http://localhost:10000/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  const headers={'access-control-allow-origin':'*'};
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'GET,POST,PATCH,OPTIONS','access-control-allow-headers':'authorization,content-type'}});
  let body={data:[]};
  if(url.pathname==='/api/me')body={user:{id:userId,full_name:'Store Owner',role:'owner',active:true,session_id:sessionId,verification_expires_at:'2099-01-01T00:00:00Z'}};
  else if(url.pathname==='/api/offline-snapshot')body={products:products.filter(part=>part.active!==false),suppliers:[]};
  else if(url.pathname==='/api/products'&&request.method()==='GET'){
   const data=products.filter(part=>part.active!==false);
   body={data,count:data.length};
  } else if(url.pathname==='/api/products'&&request.method()==='POST'){
   writes.push({method:'POST',payload:request.postDataJSON()});body={product:{...request.postDataJSON(),id:partId}};
  } else if(url.pathname===`/api/products/${partId}`&&request.method()==='PATCH'){
   const payload=request.postDataJSON();writes.push({method:'PATCH',payload});Object.assign(products[0],payload);body={product:products[0]};
  } else if(url.pathname==='/api/inventory/movement'){
   const payload=request.postDataJSON();movements.push(payload);body={transactionId:'test-correction'};
  } else if(url.pathname.startsWith('/api/barcode/')){
   const code=decodeURIComponent(url.pathname.split('/').at(-1));
   body={product:code==='ANOTHER-PART'?{id:'99999999-9999-4999-8999-999999999999',description:'Engine oil',barcode:code}:products.find(part=>part.barcode===code)||null};
  } else if(url.pathname==='/api/forecast/readiness')body={ready:false,status:'no_observations',products:[],requirements:{sale_days:5,calendar_days:35,maximum_age_days:31}};
  return route.fulfill({json:body,headers});
 });
 return {writes,movements};
}

test('inventory keeps shelf details collapsed while stock, price and actions remain visible on a phone',async({page,context})=>{
 await inventoryFixture(context);
 await page.setViewportSize({width:390,height:844});
 await page.goto('/inventory');
 const card=page.getByRole('article').filter({hasText:'Toyota brake pad'});
 await expect(card.getByText('Available stock',{exact:true})).toBeVisible();
 await expect(card.getByText('₱125.50',{exact:true})).toBeVisible();
 await expect(card.getByRole('button',{name:'Edit details',exact:true})).toBeVisible();
 await expect(card.getByText('Shelf A',{exact:true})).toBeHidden();
 await card.locator('summary').click();
 await expect(card.getByText('Shelf A',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('new parts reject fractional stock and thresholds while retaining centavo prices and accessories',async({page,context})=>{
 const fixture=await inventoryFixture(context);
 await page.goto('/inventory');await page.getByRole('button',{name:'Add a new part',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Part name *',{exact:true}).fill('Phone holder');
 await dialog.getByLabel('Category',{exact:true}).selectOption('accessories');
 await dialog.getByLabel('Selling price per unit',{exact:true}).fill('12.50');
 await dialog.getByLabel('Starting quantity *',{exact:true}).fill('0.5');
 await page.getByRole('button',{name:'Save part',exact:true}).click();
 await expect(dialog.locator('#current_stock')).toHaveAttribute('aria-invalid','true');
 await expect(dialog.locator('#current_stock-message')).toContainText('whole number');
 expect(fixture.writes).toHaveLength(0);
 await dialog.getByLabel('Starting quantity *',{exact:true}).fill('2');
 await dialog.locator('summary').filter({hasText:'Stock alerts'}).click();
 await dialog.getByLabel('Alert me when stock reaches *',{exact:true}).fill('1.5');
 await page.getByRole('button',{name:'Save part',exact:true}).click();
 await expect(dialog.locator('#minimum_stock-message')).toContainText('whole number');
 await dialog.getByLabel('Alert me when stock reaches *',{exact:true}).fill('1');
 await dialog.getByLabel('Reserve quantity',{exact:true}).fill('0.5');
 await page.getByRole('button',{name:'Save part',exact:true}).click();
 await expect(dialog.locator('#safety_stock-message')).toContainText('whole number');
 await dialog.getByLabel('Reserve quantity',{exact:true}).fill('2');
 await page.getByRole('button',{name:'Save part',exact:true}).click();
 await expect.poll(()=>fixture.writes.length).toBe(1);
 expect(fixture.writes[0].payload).toMatchObject({category:'accessories',current_stock:2,minimum_stock:1,safety_stock:2,selling_price:12.5});
});

test('stock corrections reject decimal quantities before making a request',async({page,context})=>{
 const fixture=await inventoryFixture(context);
 await page.setViewportSize({width:390,height:844});await page.goto('/inventory');
 await page.getByRole('article').getByRole('button',{name:'Adjust stock',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Quantity *',{exact:true}).fill('0.5');
 await dialog.getByLabel('Reason for correction *',{exact:true}).fill('Damaged part');
 await page.getByRole('button',{name:'Confirm correction',exact:true}).click();
 await expect(dialog.locator('#quantity-message')).toContainText('whole number');
 expect(fixture.movements).toHaveLength(0);
 await dialog.getByLabel('Quantity *',{exact:true}).fill('2');
 await page.getByRole('button',{name:'Confirm correction',exact:true}).click();
 await expect.poll(()=>fixture.movements.length).toBe(1);
 expect(fixture.movements[0]).toMatchObject({quantity:2,tx_type:'stock_out',notes:'Damaged part'});
});

test('removing an active part needs confirmation and stays excluded from offline selling',async({page,context})=>{
 const fixture=await inventoryFixture(context);
 await page.setViewportSize({width:390,height:844});await page.goto('/inventory');
 await expect(page.getByText(/Inventory saved/)).toBeVisible();
 await page.getByRole('article').getByRole('button',{name:'Edit details',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.locator('summary').filter({hasText:'Remove from active inventory'}).click();
 await dialog.getByRole('button',{name:'Remove from active inventory',exact:true}).click();
 expect(fixture.writes).toHaveLength(0);
 await dialog.getByRole('button',{name:'Keep this part',exact:true}).click();
 expect(fixture.writes).toHaveLength(0);
 await dialog.getByRole('button',{name:'Remove from active inventory',exact:true}).click();
 await dialog.getByRole('button',{name:'Confirm removal',exact:true}).click();
 await expect.poll(()=>fixture.writes.length).toBe(1);
 expect(fixture.writes).toEqual([{method:'PATCH',payload:{active:false}}]);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('article').filter({hasText:'Toyota brake pad'})).toHaveCount(0);
 await context.setOffline(true);
 await expect(page.getByText('Working offline',{exact:true})).toBeVisible();
 await expect(page.getByRole('article').filter({hasText:'Toyota brake pad'})).toHaveCount(0);
 await page.getByRole('navigation',{name:'Quick navigation'}).getByRole('link',{name:'Sell or receive',exact:true}).click();
 await expect(page.getByRole('region',{name:'Choose parts'}).getByRole('article')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Add Toyota brake pad to basket'})).toHaveCount(0);
});

test('scanning another saved part barcode does not replace the edited part identifier',async({page,context})=>{
 const fixture=await inventoryFixture(context);
 await page.setViewportSize({width:390,height:844});await page.goto('/inventory');
 await page.getByRole('article').getByRole('button',{name:'Edit details',exact:true}).click();
 await page.getByRole('dialog').locator('summary').filter({hasText:'More part details'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Scan',exact:true}).click();
 await page.getByLabel('Barcode number',{exact:true}).fill('ANOTHER-PART');
 await page.getByRole('button',{name:'Find this barcode',exact:true}).click();
 await expect(page.getByLabel('Barcode',{exact:true})).toHaveValue('BOX-001');
 await expect(page.locator('#barcode-message')).toContainText('already belongs to another part');
 expect(fixture.writes).toHaveLength(0);
});
