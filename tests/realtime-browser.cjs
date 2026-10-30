// Run with Playwright and its Chromium browser installed: node tests/realtime-browser.cjs
// The browser uses mocked API/auth responses, never a production database.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { setTimeout: pause } = require('node:timers/promises');
const assert = require('node:assert/strict');
const path = require('node:path');
const origin = 'http://127.0.0.1:5180';
const root = path.resolve(__dirname, '..');
const userId = '11111111-1111-4111-8111-111111111111';
const idA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const idB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const today = '2026-10-30';
const products = [
  {id:idA,part_number:'A101',description:'Alex filter',brand:'Toyota',current_stock:10,minimum_stock:1,stock_status:'ok'},
  {id:idB,part_number:'A102',description:'Alarcon belt',brand:'Toyota',current_stock:20,minimum_stock:1,stock_status:'ok'},
  {id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',part_number:'123',description:'Numeric part',brand:'Toyota',current_stock:5,minimum_stock:1,stock_status:'ok'}
];
let sales = [], planningRequests = 0;
const errors = [];
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5180','--strictPort'], {
  cwd:path.join(root,'apps/web'), stdio:'pipe', env:{...process.env,VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_ANON_KEY:'browser-test-public-key',VITE_API_URL:'http://localhost:10000'}
});
let serverLog = '';
server.stdout.on('data', d=>serverLog+=d);server.stderr.on('data', d=>serverLog+=d);
async function until(fn, label) {
  for (let i=0;i<80;i++) { if(await fn()) return; await pause(100); }
  throw new Error(`Timed out: ${label}`);
}
(async()=>{
 let browser;
 try {
  await until(async()=>{try{return (await fetch(origin)).ok;}catch{return false;}},'frontend startup');
  browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (require('node:fs').existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath())});
  const context = await browser.newContext({viewport:{width:1440,height:1100}});
  await context.addInitScript(({userId})=>{
    const user={id:userId,email:'owner@example.test',aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{}};
    localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.test',refresh_token:'test-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user}));
  },{userId});
  await context.route('**/auth/v1/**', route=>route.fulfill({json:{id:userId,email:'owner@example.test'}}));
  await context.route('http://localhost:10000/**', async route=>{
    const request=route.request(),url=new URL(request.url()),p=url.pathname;
    if(request.method()==='OPTIONS') return route.fulfill({status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-allow-methods':'*'}});
    let body;
    if(p==='/api/me') body={user:{id:userId,full_name:'Test Owner',role:'owner',active:true}};
    else if(p==='/api/suppliers') body={data:[]};
    else if(p==='/api/products' && request.method()==='POST') {
      const product={...request.postDataJSON(),id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',stock_status:'ok'}; products.push(product); body={product};
    }
    else if(p==='/api/products') {
      const q=(url.searchParams.get('q')||'').toLowerCase();
      const data=products.filter(x=>`${x.part_number} ${x.description} ${x.brand}`.toLowerCase().includes(q));
      // Force old responses to arrive after a newer search.
      if(q==='al') await pause(400);
      body={data,count:data.length};
    }
    else if(p==='/api/forecast/products') body={data:products.map(x=>({...x,product_id:x.id,predicted_total:5,forecast_days:x.id===idA?2:0}))};
    else if(p==='/api/forecast/runs') body={data:[{id:'run',status:'completed',model_version:'test-model',started_at:today,metrics:{}}]};
    else if(p==='/api/data-quality') body={actualDemandRows:sales.length};
    else if(p.startsWith('/api/forecast/product/')) {
      planningRequests++;
      const product=products.find(x=>x.id===p.split('/').pop());
      body={product:{...product},today,actualSales:[...sales],data:product.id===idA?[{forecast_date:'2026-10-31',predicted_quantity:2},{forecast_date:'2026-11-01',predicted_quantity:3}]:[]};
    }
    else if(p==='/api/inventory/movement') {
      const move=request.postDataJSON(),product=products.find(x=>x.id===move.product_id),quantity=Number(move.quantity);
      product.current_stock+=move.tx_type==='stock_in'?quantity:-quantity;
      if(move.tx_type==='sale') sales.push({occurred_on:today,quantity});
      body={transactionId:'tx'};
    }
    else if(p==='/api/dashboard') body={metrics:{totalProducts:products.length,inventoryValue:products.reduce((s,x)=>s+Number(x.current_stock)*10,0)},salesTrend:[{day:'2026-10-28',revenue:40},{day:'2026-10-29',revenue:50},{day:today,revenue:sales.reduce((s,x)=>s+x.quantity*10,0)}],fastMoving:[],slowMoving:[],reorder:[]};
    else if(p==='/api/transactions') body={data:[],count:0};
    else throw new Error(`Unhandled API request ${p}`);
    await route.fulfill({json:body,headers:{'access-control-allow-origin':origin}});
  });
  const inventory=await context.newPage(),forecast=await context.newPage();
  for(const page of [inventory,forecast]) page.on('pageerror',error=>errors.push(error.message));
  await inventory.goto(`${origin}/inventory`);
  await forecast.goto(`${origin}/forecast`);
  await forecast.getByText('On hand: 10 units',{exact:true}).waitFor();
  const search=inventory.getByRole('combobox',{name:'Search part number, description, or brand'});
  await search.fill('A');
  await inventory.getByRole('option').filter({hasText:'Alex filter'}).waitFor();
  await inventory.getByRole('option').filter({hasText:'Alarcon belt'}).waitFor();
  await search.fill('1');
  await inventory.getByRole('option').filter({hasText:'Numeric part'}).waitFor();
  await search.fill('al'); await pause(170); await search.fill('123');
  await inventory.getByRole('option').filter({hasText:'Numeric part'}).waitFor();
  await pause(450);
  assert.equal(await inventory.getByRole('listbox').getByRole('option').count(),1,'late search response must not replace current results');
  await search.fill('A');
  await inventory.getByRole('option').filter({hasText:'Alex filter'}).waitFor();
  await search.press('ArrowDown'); await search.press('Enter');
  assert.equal(await search.inputValue(),'A101');
  assert.equal(await inventory.getByRole('listbox').count(),0);
  await search.fill(''); await search.blur();
  const curve=forecast.locator('.recharts-line').last().locator('path.recharts-line-curve');
  await curve.waitFor();
  const original=await curve.getAttribute('d');
  const row=inventory.getByRole('row').filter({hasText:'Alex filter'});
  await row.getByTitle('Stock in',{exact:true}).click();
  await inventory.getByText('Quantity *',{exact:true}).locator('..').locator('input').fill('5');
  await inventory.getByRole('button',{name:'Record transaction',exact:true}).click();
  await forecast.getByText('On hand: 15 units',{exact:true}).waitFor();
  assert.notEqual(await curve.getAttribute('d'),original,'cross-tab stock-in must update graph geometry');
  const restocked=await curve.getAttribute('d');
  await row.getByTitle('Record sale',{exact:true}).click();
  await inventory.getByText('Quantity *',{exact:true}).locator('..').locator('input').fill('2');
  await inventory.getByRole('button',{name:'Record transaction',exact:true}).click();
  await forecast.getByText('On hand: 13 units',{exact:true}).waitFor();
  assert.notEqual(await curve.getAttribute('d'),restocked,'sale must update projected graph');
  assert.equal(sales.length,1);
  const forecastSearch=forecast.getByRole('combobox',{name:'Search part number, description, or brand'});
  await forecastSearch.fill('a');
  await forecast.getByRole('option').filter({hasText:'Alarcon belt'}).click();
  await forecast.getByText('On hand: 20 units',{exact:true}).waitFor();
  await forecastSearch.fill('a');
  await forecast.getByRole('option').filter({hasText:'Alex filter'}).click();
  await forecast.getByText('On hand: 13 units',{exact:true}).waitFor();
  await inventory.getByRole('button',{name:'Add product',exact:true}).click();
  await inventory.getByText('Part number',{exact:true}).locator('..').locator('input').fill('A999');
  await inventory.getByText('Description *',{exact:true}).locator('..').locator('input').fill('Added live');
  await inventory.getByRole('button',{name:'Save product',exact:true}).click();
  await until(()=>Promise.resolve(products.length===4),'new product saved');
  await forecastSearch.fill('A999');
  await forecast.getByRole('option').filter({hasText:'Added live'}).click();
  await forecast.getByText('On hand: 0 units',{exact:true}).waitFor();
  await forecast.getByRole('link',{name:'Dashboard',exact:true}).click();
  await forecast.getByRole('heading',{name:'30-day sales trend'}).waitFor();
  const salesCurve=forecast.locator('.recharts-line-curve');
  await salesCurve.waitFor();
  const oldTrend=await salesCurve.getAttribute('d');
  await row.getByTitle('Record sale',{exact:true}).click();
  await inventory.getByText('Quantity *',{exact:true}).locator('..').locator('input').fill('1');
  await inventory.getByRole('button',{name:'Record transaction',exact:true}).click();
  await until(async()=>await salesCurve.getAttribute('d')!==oldTrend,'dashboard sales graph updates across tabs');
  await forecast.getByRole('link',{name:'Demand Forecast',exact:true}).click();
  await forecast.getByText('On hand: 12 units',{exact:true}).waitFor();
  await forecast.setViewportSize({width:390,height:844});
  await forecastSearch.fill('a');
  await forecast.getByRole('option').filter({hasText:'Alarcon belt'}).waitFor();
  const box=await forecast.getByRole('listbox').boundingBox();
  assert.ok(box.x>=0 && box.x+box.width<=390,'suggestions fit a mobile screen');
  assert.ok(planningRequests>=5);
  assert.deepEqual(errors,[]);
  console.log('PASS: one-letter/numeric suggestions, keyboard selection, stale-search protection, two-tab stock/sale graph updates, product selection live new-product discovery, dashboard graph updates, return navigation and mobile suggestions.');
  await context.close();
 } catch(error) { console.error(serverLog); throw error; }
 finally {await browser?.close();server.kill('SIGTERM');}
})().catch(error=>{console.error(error);process.exitCode=1;});
