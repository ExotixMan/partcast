import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{PARTCAST_DEMO_MODE:'false',SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters',GMAIL_CLIENT_ID:'fixture-client',GMAIL_CLIENT_SECRET:'fixture-secret',GMAIL_REFRESH_TOKEN:'fixture-refresh',GMAIL_SENDER_EMAIL:'sender@example.test'});
const {adminDb}=await import('../src/supabase.js');
const supplier='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const p1='33333333-3333-4333-8333-333333333333',p2='99999999-9999-4999-8999-999999999999',p3='44444444-4444-4444-8444-444444444444',inactive='55555555-5555-4555-8555-555555555555';

async function fixture(run){
 const {default:express}=await import('express'),{default:api}=await import('../src/routes/api.js'),{default:admin}=await import('../src/routes/admin.js'),{errorHandler}=await import('../src/middleware/error.js');
 const previous={from:adminDb.from,fetch:globalThis.fetch};
 const suppliers=[{id:supplier,name:'Selected supplier',email:'selected@example.test',active:true},{id:other,name:'Main supplier',email:'main@example.test',active:true}];
 const products=[{id:p1,description:'Brake pad',part_number:'BP-001',unit_cost:100,active:true},{id:p2,description:'Oil filter',part_number:'OF-001',unit_cost:50,active:true},{id:p3,description:'Air filter',part_number:'AF-001',unit_cost:40,active:true},{id:inactive,description:'Removed part',active:false}];
 const links=[{product_id:p1,supplier_id:supplier,is_primary:true,latest_unit_cost:90,lead_time_days:3},{product_id:p2,supplier_id:other,is_primary:true,latest_unit_cost:50,lead_time_days:5},{product_id:p2,supplier_id:supplier,is_primary:false,latest_unit_cost:55,lead_time_days:9},{product_id:inactive,supplier_id:supplier,is_primary:true,latest_unit_cost:10}];
 const recommendations=products.filter(p=>p.active).map(p=>({product_id:p.id,part_number:p.part_number,description:p.description,unit:'pcs',current_stock:p.id===p1?0:8,predicted_quantity:0,recommended_quantity:p.id===p1?2:0,status:p.id===p1?'out_of_stock':'ok',supplier_id:p.id===p1?supplier:other,supplier_name:p.id===p1?'Selected supplier':'Main supplier',supplier_email:p.id===p1?'selected@example.test':'main@example.test',estimated_unit_cost:p.unit_cost}));
 const calls=[],writes=[],messages=[],rpcCalls=[];
 adminDb.from=table=>{
  const filters=[],membership=[];let range=null,upsert=null;
  const query={
   select(){return this;},eq(key,value){filters.push([key,value]);return this;},in(key,value){membership.push([key,value]);return this;},order(){return this;},or(){return this;},range(from,to){range=[from,to];return this;},
   upsert(value,options){upsert={value,options};return this;},insert(){return this;},
   async maybeSingle(){const result=await execute();return {...result,data:result.data[0]??null};},
   then(resolve,reject){return execute().then(resolve,reject);}
  };
  async function execute(){
   calls.push({table,filters,membership,range});
   if(upsert){writes.push(upsert);if(!links.some(l=>l.product_id===upsert.value.product_id&&l.supplier_id===upsert.value.supplier_id))links.push({...upsert.value});return {data:[],error:null};}
   let data=table==='suppliers'?suppliers:table==='products'?products:table==='reorder_recommendations'?recommendations:table==='product_suppliers'?links.map(l=>({...l,supplier:suppliers.find(s=>s.id===l.supplier_id)})):[];
   data=data.filter(row=>filters.every(([key,value])=>key==='supplier.active'?row.supplier?.active===value:row[key]===value)&&membership.every(([key,values])=>values.includes(row[key])));
   if(range)data=data.slice(range[0],range[1]+1);
   return {data,error:null};
  }
  return query;
 };
 globalThis.fetch=async(url,options)=>{
  if(String(url)==='http://127.0.0.1:9/rest/v1/rpc/save_product_supplier'){
   rpcCalls.push({body:JSON.parse(options.body),authorization:new Headers(options.headers).get('authorization')});
   return new Response(JSON.stringify({product_id:p1,supplier_id:other,is_primary:true}),{headers:{'content-type':'application/json'}});
  }
  if(String(url).startsWith('http://127.0.0.1:'))return previous.fetch(url,options);
  if(url==='https://oauth2.googleapis.com/token')return new Response(JSON.stringify({access_token:'fixture-access',scope:'https://www.googleapis.com/auth/gmail.send',expires_in:3600}));
  assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');messages.push(Buffer.from(JSON.parse(options.body).raw,'base64url').toString());return new Response('{"id":"fixture-message"}');
 };
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:'11111111-1111-4111-8111-111111111111',role:req.headers['x-test-role']||'owner',accessToken:'fixture-verified-session'};next();});app.use('/api/admin',admin);app.use('/api',api);app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const request=(path,body,role='owner')=>fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-test-role':role},...(body?{body:JSON.stringify(body)}:{})});
 try{await run({request,links,calls,writes,messages,suppliers,products,recommendations,rpcCalls});}
 finally{adminDb.from=previous.from;globalThis.fetch=previous.fetch;await new Promise(resolve=>server.close(resolve));}
}

test('supplier picker includes in-stock secondary-supplier parts, excludes inactive parts and keeps main restock grouping',async()=>fixture(async({request,calls,recommendations})=>{
 const response=await request(`/api/reorder?onlyNeeded=false&supplierId=${supplier}`);assert.equal(response.status,200);
 const {data}=await response.json();assert.deepEqual(data.map(r=>r.product_id).sort(),[p1,p2].sort());
 const secondary=data.find(r=>r.product_id===p2);assert.equal(secondary.supplier_id,supplier);assert.equal(secondary.supplier_email,'selected@example.test');assert.equal(secondary.current_stock,8);assert.equal(secondary.estimated_unit_cost,55);
 assert.equal(recommendations.find(r=>r.product_id===p2).supplier_id,other);
 assert(calls.find(c=>c.table==='product_suppliers').filters.some(([key,value])=>key==='supplier.active'&&value===true));
}));

test('email accepts linked secondary supplier parts and rejects unlinked or inactive parts before contacting Gmail',async()=>fixture(async({request,messages})=>{
 const draft=id=>({subject:'Our order',message:'Please confirm availability.',items:[{product_id:id,part_number:'OF-001',description:'Oil filter',unit:'pcs',quantity:2}]});
 let response=await request(`/api/admin/supplier-email/${supplier}`,draft(p2));assert.equal(response.status,200);assert.equal(messages.length,1);assert.match(messages[0],/selected@example.test/);assert.doesNotMatch(messages[0],/main@example.test/);assert.match(messages[0],/OF-001 \| Oil filter \| 2 pcs/);
 for(const id of [p3,inactive]){response=await request(`/api/admin/supplier-email/${supplier}`,draft(id));assert.equal(response.status,422);}
 assert.equal(messages.length,1);
}));

test('explicit inventory addition preserves existing supplier settings and main supplier; repeat requests are harmless',async()=>fixture(async({request,links,writes,messages})=>{
 const previous=structuredClone(links);
 let response=await request(`/api/suppliers/${supplier}/parts`,{product_id:p2});assert.equal(response.status,200);assert.deepEqual(links,previous);
 assert.equal(writes[0].options.ignoreDuplicates,true);
 for(let attempt=0;attempt<2;attempt++){
  response=await request(`/api/suppliers/${supplier}/parts`,{product_id:p3});assert.equal(response.status,200);assert.equal((await response.json()).data.supplier_id,supplier);
 }
 assert.equal(links.filter(l=>l.product_id===p3&&l.supplier_id===supplier).length,1);assert.equal(links.find(l=>l.product_id===p3).is_primary,false);assert.equal(messages.length,0);
}));

test('supplier assignment validates IDs, active records and staff permissions before writes',async()=>fixture(async({request,writes,suppliers})=>{
 assert.equal((await request('/api/suppliers/invalid/parts',{product_id:p3})).status,400);
 assert.equal((await request(`/api/suppliers/${supplier}/parts`,{product_id:'invalid'})).status,400);
 assert.equal((await request(`/api/suppliers/${supplier}/parts`,{product_id:inactive})).status,422);
 for(const role of ['cashier','inventory_staff'])assert.equal((await request(`/api/suppliers/${supplier}/parts`,{product_id:p3},role)).status,403);
 suppliers[0].active=false;assert.equal((await request(`/api/suppliers/${supplier}/parts`,{product_id:p3})).status,422);assert.equal(writes.length,0);
}));

test('supplier catalogs read beyond 1000 assignments with bounded product queries',async()=>fixture(async({request,links,recommendations,calls})=>{
 for(let i=0;i<1001;i++){
  const id=`part-${String(i).padStart(4,'0')}`;links.push({product_id:id,supplier_id:supplier,latest_unit_cost:1});recommendations.push({product_id:id,description:`Extra ${i}`,current_stock:1,status:'ok',recommended_quantity:0});
 }
 const response=await request(`/api/reorder?onlyNeeded=false&supplierId=${supplier}`);assert.equal(response.status,200);assert.equal((await response.json()).data.length,1003);
 assert(calls.filter(c=>c.table==='product_suppliers').some(c=>c.range[0]===1000));
 assert(calls.filter(c=>c.table==='reorder_recommendations').every(c=>c.membership[0][1].length<=200));
}));

test('supplier directory reads all pages and the assignment API validates before one atomic verified-user RPC',async()=>fixture(async({request,suppliers,rpcCalls,writes})=>{
 for(let i=0;i<1001;i++)suppliers.push({id:`supplier-${i}`,name:`Supplier ${i}`,active:true});
 let response=await request('/api/suppliers');assert.equal(response.status,200);assert.equal((await response.json()).data.length,1003);
 const body={latest_unit_cost:123.45,lead_time_days:9,is_primary:true};
 for(const [productId,supplierId] of [['invalid',other],[p1,'invalid']])assert.equal((await request(`/api/products/${productId}/suppliers/${supplierId}`,body)).status,400);
 assert.equal(rpcCalls.length,0);
 response=await request(`/api/products/${p1}/suppliers/${other}`,body);assert.equal(response.status,200);assert.equal(rpcCalls.length,1);assert.equal(rpcCalls[0].authorization,'Bearer fixture-verified-session');
 assert.deepEqual(rpcCalls[0].body,{p_product_id:p1,p_supplier_id:other,p_latest_unit_cost:123.45,p_lead_time_days:9,p_is_primary:true,p_supplier_part_number:null});assert.equal(writes.length,0);
}));
