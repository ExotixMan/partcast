import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',GMAIL_CLIENT_ID:'test-only-client-id',GMAIL_CLIENT_SECRET:'test-only-client-secret',GMAIL_REFRESH_TOKEN:'test-only-refresh-token',GMAIL_SENDER_EMAIL:'sender@example.test'});
const {adminDb}=await import('../src/supabase.js');
const {autoEmailSuppliers}=await import('../src/routes/jobs.js');

test('automatic email respects cooldown, limits eligible sends and always releases its lease',async()=>{
 const oldFrom=adminDb.from,oldRpc=adminDb.rpc,oldFetch=globalThis.fetch;
 let enabled=true,claim=true,reorderError=null;const delivered=[],logs=[],rpc=[];
 adminDb.rpc=async(name,args)=>{rpc.push({name,args});return {data:name==='claim_job'?claim:null,error:null};};
 adminDb.from=table=>{
  const filters={};let insert;
  const result=()=>{
   if(table==='integration_settings')return {data:null,error:null};
   if(table==='system_settings')return {data:{value:filters.key==='auto_supplier_email_enabled'?enabled:3}};
   if(table==='reorder_recommendations')return {data:Array.from({length:12},(_,i)=>({supplier_id:`supplier-${i}`,supplier_name:`Supplier ${i}`,supplier_email:`supplier${i}@example.test`,product_id:`part-${i}`,description:'Brake pad',current_stock:0,recommended_quantity:5})),error:reorderError};
   if(insert){logs.push(insert);return {error:null};}
   return {data:['supplier-0','supplier-1'].includes(filters.supplier_id)?[{id:'recent'}]:[]};
  };
  const query={select(){return this;},eq(k,v){filters[k]=v;return this;},gt(){return this;},or(){return this;},gte(){return this;},not(){return this;},order(){return this;},limit(){return this;},insert(v){insert=v;return this;},maybeSingle:async()=>result(),then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);}};
  return query;
 };
 globalThis.fetch=async(url,options)=>{
  if(url==='https://oauth2.googleapis.com/token')return new Response(JSON.stringify({access_token:'test-only-access',expires_in:3600,scope:'https://www.googleapis.com/auth/gmail.send'}),{status:200});
  assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  const mime=Buffer.from(JSON.parse(options.body).raw,'base64url').toString();delivered.push(mime.match(/To: ([^\r\n]+)/)[1]);
  return new Response(JSON.stringify({id:'test-message'}),{status:200});
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

test('edited email sends exact quantities and escapes HTML in every editable field',async()=>{
 const {sendSupplierEmail}=await import('../src/utils/email.js');const previous=globalThis.fetch;let delivered;
 globalThis.fetch=async(url,options)=>{if(url==='https://oauth2.googleapis.com/token')return new Response(JSON.stringify({access_token:'test-only-access',expires_in:3600}),{status:200});assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');const mime=Buffer.from(JSON.parse(options.body).raw,'base64url').toString();delivered={subject:Buffer.from(mime.match(/Subject: =\?UTF-8\?B\?([^?]+)/)[1],'base64').toString(),to:[{email:mime.match(/To: ([^\r\n]+)/)[1]}],htmlContent:mime.split('Content-Type: text/html; charset=UTF-8')[1]};return new Response(JSON.stringify({id:'fake-id'}),{status:200});};
 try{
 await sendSupplierEmail({supplier:{name:'Supplier',email:'supplier@example.test'},subject:'Our order',message:'Please deliver <script>bad</script>\nThank you.',items:[{part_number:'<img>',description:'Brake pad & bolts',current_stock:1,quantity:2.5,recommended_quantity:5,unit:'pcs',extra_values:{'77777777-7777-4777-8777-777777777777':'Next week <script>'}}],extra_columns:[{id:'77777777-7777-4777-8777-777777777777',label:'Delivery <date>'}]});
 assert.equal(delivered.subject,'Our order');assert.equal(delivered.to[0].email,'supplier@example.test');assert.match(delivered.htmlContent,/>2.5</);assert.ok(!delivered.htmlContent.includes('<script>'));assert.match(delivered.htmlContent,/&lt;script&gt;/);assert.match(delivered.htmlContent,/&lt;img&gt;/);assert.match(delivered.htmlContent,/Brake pad &amp; bolts/);assert.match(delivered.htmlContent,/<br>/);assert.match(delivered.htmlContent,/Delivery &lt;date&gt;/);assert.match(delivered.htmlContent,/Next week &lt;script&gt;/);assert.match(delivered.htmlContent,/>pcs</);
 }finally{globalThis.fetch=previous;}
});
