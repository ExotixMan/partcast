import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters'});
const {createSupplierRequestSender}=await import('../src/services/supplierRequests.js');
const input={requestId:'11111111-1111-4111-8111-111111111111',actorId:'owner',supplierId:'supplier',draft:{subject:'Friday order',message:'Please confirm prices.',items:[{product_id:'part',quantity:2}]}};
function fixture(){
 const rows=[];let deliveries=0,mode='ok',failSave=false,gate;
 const db={from(){
  const filters=[];let action='select',value;
  const query={select(){return this;},eq(k,v){filters.push([k,v]);return this;},insert(v){action='insert';value=v;return this;},update(v){action='update';value=v;return this;},async maybeSingle(){const r=await execute();return {...r,data:r.data?.[0]??null};},then(resolve,reject){return execute().then(resolve,reject);}};
  async function execute(){
   if(action==='insert'){
    if(rows.some(r=>r.client_request_id===value.client_request_id))return {data:null,error:{code:'23505'}};
    rows.push({...structuredClone(value),id:`row-${rows.length}`});return {data:null,error:null};
   }
   const found=rows.filter(r=>filters.every(([k,v])=>r[k]===v));
   if(action==='update'){
    if(failSave&&value.status==='sent')return {error:{message:'Database write interrupted'}};
    found.forEach(r=>Object.assign(r,value));
   }
   return {data:found,error:null};
  }
  return query;
 }};
 const sender=createSupplierRequestSender({db,prepare:async()=>({supplier:{id:'supplier',email:'supplier@example.test'},subject:'Friday order',items:[{product_id:'part',description:'Brake pad',quantity:2,recommended_quantity:2}]}),send:async()=>{
  deliveries++;if(gate)await gate;
  if(mode==='oauth')throw Object.assign(new Error('Reconnect Gmail'),{code:'GMAIL_OAUTH_INVALID_GRANT',status:503});
  if(mode==='timeout')throw Object.assign(new Error('Interrupted after submission'),{deliveryUncertain:true});
  return {messageId:'gmail-message'};
 }});
 return {sender,rows,get deliveries(){return deliveries;},setMode:value=>mode=value,failSave:()=>failSave=true,setGate:value=>gate=value};
}
test('saved email result replays without redelivery and rejects changed details or another staff account',async()=>{
 const f=fixture();const sent=await f.sender.deliver(input);assert.equal(sent.items,1);assert.equal(f.rows[0].status,'sent');
 assert.equal((await f.sender.deliver(input)).replayed,true);assert.equal(f.deliveries,1);
 await assert.rejects(f.sender.deliver({...input,draft:{...input.draft,message:'Changed'}}),/different details/);
 await assert.rejects(f.sender.status({...input,actorId:'other'}),/another staff/);
 assert.deepEqual(await f.sender.status(input),{status:'sent',items:1});
});
test('concurrent email requests claim one durable row before sending',async()=>{
 const f=fixture();let release;f.setGate(new Promise(resolve=>release=resolve));
 const first=f.sender.deliver(input);while(!f.deliveries)await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(f.sender.deliver(input),/Delivery is not confirmed/);assert.equal(f.deliveries,1);release();await first;assert.equal(f.rows.length,1);
});
test('a definite OAuth failure can retry the same request without changing the saved payload',async()=>{
 const f=fixture();f.setMode('oauth');await assert.rejects(f.sender.deliver(input),/Reconnect Gmail/);assert.equal(f.rows[0].status,'failed');
 f.setMode('ok');await f.sender.deliver(input);assert.equal(f.rows.length,1);assert.equal(f.rows[0].status,'sent');assert.equal(f.deliveries,2);
});
test('an ambiguous Gmail submission and a failed final log save both block duplicate sends',async()=>{
 for(const failure of ['timeout','save']){
  const f=fixture();if(failure==='timeout')f.setMode('timeout');else f.failSave();
  await assert.rejects(f.sender.deliver(input),/Delivery is not confirmed/);await assert.rejects(f.sender.deliver(input),/Delivery is not confirmed/);assert.equal(f.deliveries,1);
  assert(['uncertain','sending'].includes((await f.sender.status(input)).status));
 }
});
test('a failed pre-send receipt read never contacts Gmail',async()=>{
 let deliveries=0;
 const sender=createSupplierRequestSender({db:{from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null,error:new Error('Apply the restock migration')})})},send:async()=>{deliveries++;}});
 await assert.rejects(sender.deliver(input),/restock migration/);assert.equal(deliveries,0);
 assert.deepEqual(await fixture().sender.status(input),{status:'not_found'});
});
