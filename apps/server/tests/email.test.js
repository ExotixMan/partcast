import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',BREVO_API_KEY:'test-only-provider-key',BREVO_SENDER_EMAIL:'sender@example.test'});
const {adminDb}=await import('../src/supabase.js');
const {autoEmailSuppliers}=await import('../src/routes/jobs.js');

test('automatic email respects cooldown, limits eligible sends and always releases its lease',async()=>{
 const oldFrom=adminDb.from,oldRpc=adminDb.rpc,oldFetch=globalThis.fetch;
 let enabled=true,claim=true,reorderError=null;const delivered=[],logs=[],rpc=[];
 adminDb.rpc=async(name,args)=>{rpc.push({name,args});return {data:name==='claim_job'?claim:null,error:null};};
 adminDb.from=table=>{
  const filters={};let insert;
  const result=()=>{
   if(table==='system_settings')return {data:{value:filters.key==='auto_supplier_email_enabled'?enabled:3}};
   if(table==='reorder_recommendations')return {data:Array.from({length:12},(_,i)=>({supplier_id:`supplier-${i}`,supplier_name:`Supplier ${i}`,supplier_email:`supplier${i}@example.test`,product_id:`part-${i}`,description:'Brake pad',current_stock:0,recommended_quantity:5})),error:reorderError};
   if(insert){logs.push(insert);return {error:null};}
   return {data:['supplier-0','supplier-1'].includes(filters.supplier_id)?[{id:'recent'}]:[]};
  };
  const query={select(){return this;},eq(k,v){filters[k]=v;return this;},gt(){return this;},gte(){return this;},not(){return this;},order(){return this;},limit(){return this;},insert(v){insert=v;return this;},maybeSingle:async()=>result(),then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);}};
  return query;
 };
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://api.brevo.com/v3/smtp/email');
  const body=JSON.parse(options.body);delivered.push(body.to[0].email);
  return new Response(JSON.stringify({messageId:'test-message'}),{status:201,headers:{'content-type':'application/json'}});
 };
 try{
  enabled=false;assert.equal((await autoEmailSuppliers()).skipped,true);assert.equal(rpc.length,0);
  enabled=true;claim=false;assert.equal((await autoEmailSuppliers()).skipped,true);assert.equal(delivered.length,0);
  claim=true;const result=await autoEmailSuppliers();
  assert.equal(result.skipped,false);assert.equal(delivered.length,10);assert.ok(delivered.includes('supplier11@example.test'));
  assert.equal(logs.length,10);assert.equal(rpc.at(-1).name,'release_job');
  reorderError=new Error('Store unavailable');await assert.rejects(autoEmailSuppliers(),/Store unavailable/);
  assert.equal(rpc.at(-1).name,'release_job');
 }finally{adminDb.from=oldFrom;adminDb.rpc=oldRpc;globalThis.fetch=oldFetch;}
});
