import {test,expect} from '@playwright/test';
const project='ragdjkdcrvexqfadlqbf',userId='11111111-1111-4111-8111-111111111111',sessionId='77777777-7777-4777-8777-777777777777',partId='33333333-3333-4333-8333-333333333333',supplierId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token=`e30.${Buffer.from(JSON.stringify({session_id:sessionId,amr:[{method:'password'}]})).toString('base64url')}.test-only-signature`;
async function fixture(context,{language='en',large=false,dark=false,limitations=false,role='owner'}={}){
 await context.addInitScript(({project,userId,token,language,large,dark})=>{
  localStorage.setItem(`sb-${project}-auth-token`,JSON.stringify({access_token:token,refresh_token:'test-only-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:userId,email:'owner@example.test',aud:'authenticated'}}));
  localStorage.setItem('partcast-language',language);localStorage.setItem('partcast-text-size',large?'large':'standard');localStorage.setItem('partcast-theme',dark?'dark':'light');
 },{project,userId,token,language,large,dark});
 const writes=[],product={id:partId,part_number:'BP-001',description:'Brake pad',unit:'pcs',category:'parts',current_stock:45,minimum_stock:1,safety_stock:1,selling_price:100,unit_cost:60,photo_paths:[],search_aliases:[],stock_status:'ok'};
 await context.route('http://localhost:10000/**',async route=>{
  const req=route.request(),url=new URL(req.url()),headers={'access-control-allow-origin':'*'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type'}});
  if(req.method()!=='GET')writes.push(url.pathname);
  let body={data:[]};
  if(url.pathname==='/api/me')body={user:{id:userId,full_name:'Owner',active:true,role,session_id:sessionId,verification_expires_at:'2099-01-01T00:00:00Z'}};
  else if(url.pathname==='/api/offline-snapshot')body={products:[product],suppliers:[]};
  else if(url.pathname==='/api/products')body={data:[product],count:1};
  else if(url.pathname==='/api/suppliers')body={data:[{id:supplierId,name:'Parts supplier',email:'supplier@example.test'}]};
  else if(url.pathname==='/api/reorder')body={data:[{...product,product_id:partId,supplier_id:supplierId,supplier_name:'Parts supplier',supplier_email:'supplier@example.test',recommended_quantity:2,predicted_quantity:32,status:'low_stock'}]};
  else if(url.pathname==='/api/forecast/runs')body={data:[{id:'run',status:'completed',completed_at:'2026-11-03T00:00:00Z',metrics:{mae:0.0177,coverage_warning:limitations,stale_product_count:limitations?3:0,horizon_validation:{status:limitations?'no_improvement_over_zero':'improvement_observed',model:{mae:2,wape_percent:5,actual_recorded_units:32,predicted_units:30},window_count:2,horizon_days:30,tested_product_count:1,nonzero_window_count:2}}}]};
  else if(url.pathname==='/api/forecast/products')body={run:{id:'run'},data:[{...product,product_id:partId,predicted_total:32,forecast_days:2}]};
  else if(url.pathname.startsWith('/api/forecast/product/'))body={product,today:'2026-11-03',actualSales:[],run:{id:'run'},data:[4,5].map(day=>({run_id:'run',forecast_date:`2026-11-0${day}`,predicted_quantity:16}))};
  else if(url.pathname==='/api/forecast/automation')body={status:'ready',horizon_days:30,last_run_id:'run'};
  else if(url.pathname==='/api/forecast/status')body={ready:true};
  else if(url.pathname==='/api/data-quality')body={actualDemandRows:20,importedTrainingRows:50};
  else if(url.pathname==='/api/forecast/recorded-sales')body={mode:'production',data:[],record_count:0,part_count:0};
  await route.fulfill({headers,json:body});
 });
 return {writes};
}

for(const [path,title,instruction] of [
 ['/counter','Sell or receive','Tap a part to add it. Tap its photo to enlarge it.'],
 ['/inventory','Inventory','Use category and stock filters to narrow the list.'],
 ['/debts','Customer balances','Use View payments to check saved payment history.'],
 ['/reorder','Restock','Suggestions start at 1–2 units per part. Check shelf stock, then review the email before sending.'],
 ['/sales','Sales','Only saved quantities are counted. Missing days remain unknown.'],
 ['/reports','Reports','Reports use the latest saved store data and need an internet connection. They download as Excel files (.xlsx).'],
 ['/imports','Import spreadsheets','Import inventory first, then past sales, then your prepared forecasting spreadsheet. Use actual quantities sold, dates, and matching part numbers.']
])test(`${title} keeps instructions in one optional guide and restores focus`,async({page,context})=>{
 const store=await fixture(context);await page.setViewportSize({width:390,height:844});await page.goto(path);
 const button=page.getByRole('button',{name:'Quick guide',exact:true});await expect(button).toHaveCount(1);
 await expect(page.getByText(instruction,{exact:true})).toHaveCount(0);
 await button.click();const dialog=page.getByRole('dialog',{name:`Quick guide: ${title}`,exact:true});
 await expect(dialog.getByText(instruction,{exact:true})).toBeVisible();
 await expect(page.locator('#root')).toHaveJSProperty('inert',true);
 await dialog.getByRole('button',{name:'Close modal',exact:true}).focus();await page.keyboard.press('Shift+Tab');
 await expect(dialog.getByRole('button',{name:'Close guide',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(button).toBeFocused();
 await expect(page.locator('#root')).toHaveJSProperty('inert',false);
 expect(store.writes).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('planning prioritizes the part and chart while detailed explanations and metrics stay together',async({page,context})=>{
 await fixture(context);await page.setViewportSize({width:1440,height:950});await page.goto('/forecast');
 await expect(page.getByText('Updates automatically',{exact:true})).toBeVisible();
 await expect(page.getByText('A guide for your next stock order',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('region',{name:'How dependable is this estimate?'})).not.toBeVisible();
 const heading=page.getByRole('heading',{name:'Look up a part',exact:true});expect((await heading.boundingBox()).y).toBeLessThan(450);
 await page.getByRole('button',{name:'Quick guide',exact:true}).click();
 const guide=page.getByRole('dialog',{name:'Quick guide: Plan ahead'});
 await expect(guide.getByText('Projected stock assumes no future deliveries.',{exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await page.getByText('Sales data and update history',{exact:true}).click();
 await expect(page.getByRole('region',{name:'How dependable is this estimate?'})).toBeVisible();
 await page.getByText('Sales data and update history',{exact:true}).click();
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'/tmp/partcast-planning-organized-desktop.png'});
});

test('help preserves an unfinished basket and stock limitations remain visible',async({page,context})=>{
 const store=await fixture(context,{limitations:true});await page.goto('/counter');
 await page.getByRole('button',{name:'Add Brake pad to basket',exact:true}).click();
 await page.getByLabel('Quantity',{exact:true}).fill('3');await page.getByRole('button',{name:'Quick guide',exact:true}).click();
 await page.getByRole('button',{name:'Close guide',exact:true}).click();await expect(page.getByLabel('Quantity',{exact:true})).toHaveValue('3');
 expect(store.writes).toEqual([]);
 await page.goto('/forecast');await expect(page.getByText('3 parts need more recent sales history.',{exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Check your sales history before ordering',exact:true})).toBeVisible();
});

test('Tagalog guides and condensed planning fit larger text on a small dark phone',async({page,context})=>{
 await fixture(context,{language:'fil',large:true,dark:true});await page.setViewportSize({width:320,height:740});
 for(const path of ['/forecast','/reorder','/inventory']){
  await page.goto(path);const open=page.getByRole('button',{name:'Maikling gabay',exact:true});await expect(open).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await open.click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Isara ang gabay',exact:true})).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(path==='/forecast')await page.screenshot({path:'/tmp/partcast-planning-guide-tagalog-320.png'});
  await dialog.getByRole('button',{name:'Isara ang gabay',exact:true}).click();await expect(open).toBeFocused();
 }
});

test('inventory field hints appear while editing and required-field errors stay visible',async({page,context})=>{
 const store=await fixture(context);await page.goto('/inventory');
 await page.getByRole('button',{name:'Add a new part',exact:true}).click();const dialog=page.getByRole('dialog');
 const help=dialog.getByRole('note',{name:'Field help'}),nameHint='Use a name staff will recognize, such as Toyota brake pad.',quantityHint='Enter how many you have now. Use 0 if there is no stock yet.';
 await dialog.getByLabel('Part name *',{exact:true}).focus();await expect(help).toContainText(nameHint);await expect(help).not.toContainText(quantityHint);await page.screenshot({path:'/tmp/partcast-inventory-field-tip.png'});
 await dialog.getByLabel('Opening stock quantity *',{exact:true}).focus();await expect(help).toContainText(quantityHint);await expect(help).not.toContainText(nameHint);
 await dialog.getByRole('button',{name:'Save part',exact:true}).click();await expect(dialog.getByLabel('Part name *',{exact:true})).toHaveAttribute('aria-invalid','true');await expect(dialog.locator('#description-message')).toBeVisible();
 await dialog.getByLabel('Opening stock quantity *',{exact:true}).focus();await expect(dialog.locator('#description-message')).toBeVisible();await expect(dialog.getByRole('alert').first()).toBeVisible();expect(store.writes).toEqual([]);
});

test('read-only inventory guides show only the tasks available to a cashier',async({page,context})=>{
 await fixture(context,{role:'cashier'});await page.goto('/inventory');
 await expect(page.getByRole('button',{name:'Add a new part',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Quick guide',exact:true}).click();const guide=page.getByRole('dialog');
 await expect(guide.getByText('Search by name, part number or barcode.',{exact:true})).toBeVisible();
 await expect(guide.getByText('Keep stock correct',{exact:true})).toHaveCount(0);
 await expect(guide).not.toContainText('Correct stock');
});
