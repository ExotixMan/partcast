import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{PARTCAST_DEMO_MODE:'false',SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters',GMAIL_CLIENT_ID:'fixture-client',GMAIL_CLIENT_SECRET:'fixture-secret',GMAIL_REFRESH_TOKEN:'fixture-refresh',GMAIL_SENDER_EMAIL:'sender@example.test'});
const {adminDb}=await import('../src/supabase.js');

test('older database results use small purchases in APIs, supplier defaults and both chatbot languages; reviewed quantities remain exact',async()=>{
 const {default:express}=await import('express');
 const {default:api}=await import('../src/routes/api.js');
 const {default:admin}=await import('../src/routes/admin.js');
 const {errorHandler}=await import('../src/middleware/error.js');
 const {answerAssistant}=await import('../src/services/assistant.js');
 const previous={from:adminDb.from,rpc:adminDb.rpc,fetch:globalThis.fetch};
 const product='33333333-3333-4333-8333-333333333333',supplier='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const original={product_id:product,part_number:'BP-001',description:'Brake pad',unit:'pcs',supplier_id:supplier,supplier_name:'Parts supplier',supplier_email:'supplier@example.test',current_stock:0,predicted_quantity:11,recommended_quantity:11,estimated_unit_cost:100,estimated_order_cost:1100,status:'out_of_stock'};
 const messages=[];
 adminDb.from=table=>({
  select(){return this;},eq(){return this;},or(){return this;},gt(){return this;},in(){return this;},order(){return this;},limit(){return this;},insert(){return this;},
  maybeSingle:async()=>({data:table==='latest_completed_forecast_run'?{completed_at:new Date().toISOString(),horizon_days:30}:null,error:null}),
  then(resolve){return Promise.resolve({data:table==='reorder_recommendations'?[{...original}]:[],error:null}).then(resolve);}
 });
 adminDb.rpc=async name=>({data:name==='get_dashboard_metrics'?{}:[],error:null});
 globalThis.fetch=async(url,options)=>{
  if(String(url).startsWith('http://127.0.0.1:'))return previous.fetch(url,options);
  if(url==='https://oauth2.googleapis.com/token')return new Response(JSON.stringify({access_token:'fixture-access',scope:'https://www.googleapis.com/auth/gmail.send',expires_in:3600}),{status:200});
  assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  messages.push(Buffer.from(JSON.parse(options.body).raw,'base64url').toString());
  return new Response('{"id":"fixture-message"}',{status:200});
 };
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:'11111111-1111-4111-8111-111111111111',role:'owner'};next();});app.use('/api/admin',admin);app.use('/api',api);app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const path of ['/api/reorder?onlyNeeded=true','/api/dashboard']){
   const response=await fetch(base+path);assert.equal(response.status,200);
   const body=await response.json(),row=(body.data||body.reorder)[0];
   assert.equal(row.recommended_quantity,2);assert.equal(row.estimated_order_cost,200);assert.equal(row.predicted_quantity,11);assert.equal(row.current_stock,0);
  }
  const en=await answerAssistant('Which parts should I restock?','en','owner');
  assert.match(en.answer,/about 2 unit/);assert.doesNotMatch(en.answer,/about 11 unit/);assert.match(en.answer,/1–2 units per part/);
  const fil=await answerAssistant('restock','fil','owner');
  assert.match(fil.answer,/mungkahing order: 2/);assert.doesNotMatch(fil.answer,/mungkahing order: 11/);
  const demand=await answerAssistant('forecast BP-001','en','owner');
  assert.match(demand.answer,/expected demand of about 11/);assert.match(demand.answer,/suggested next purchase is about 2/);
  let response=await fetch(base+'/api/admin/supplier-email/'+supplier,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(response.status,200);assert.equal(messages.length,1);assert.match(messages[0],/BP-001 \| Brake pad \| 2 pcs/);
  const draft={subject:'Reviewed order',message:'Please confirm this one-off quantity.',items:[{product_id:product,part_number:'BP-001',description:'Brake pad',unit:'pcs',quantity:11}]};
  response=await fetch(base+'/api/admin/supplier-email/'+supplier,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});
  assert.equal(response.status,200);assert.equal(messages.length,2);assert.match(messages[1],/BP-001 \| Brake pad \| 11 pcs/);
  assert.equal(original.recommended_quantity,11);assert.equal(original.predicted_quantity,11);
 }finally{await new Promise(resolve=>server.close(resolve));adminDb.from=previous.from;adminDb.rpc=previous.rpc;globalThis.fetch=previous.fetch;}
});
