import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',GMAIL_CLIENT_ID:'test-only-client-id',GMAIL_CLIENT_SECRET:'test-only-client-secret',GMAIL_REFRESH_TOKEN:'test-only-refresh-token',GMAIL_SENDER_EMAIL:'sender@example.test'});
const {adminDb}=await import('../src/supabase.js');
const {autoEmailSuppliers}=await import('../src/routes/jobs.js');

test('cron cannot send supplier requests or read old automation settings without staff review',async()=>{
 const oldFrom=adminDb.from,oldRpc=adminDb.rpc,oldFetch=globalThis.fetch;
 let calls=0;
 const unexpected=()=>{calls++;throw new Error('Automatic supplier requests must not run.');};
 adminDb.from=unexpected;adminDb.rpc=unexpected;globalThis.fetch=unexpected;
 try{const result=await autoEmailSuppliers();assert.equal(result.skipped,true);assert.match(result.reason,/staff review/);assert.equal(calls,0);}
 finally{adminDb.from=oldFrom;adminDb.rpc=oldRpc;globalThis.fetch=oldFetch;}
});

test('legacy automation and assumed-quantity settings cannot be enabled through the admin API',async()=>{
 const {default:express}=await import('express');const {default:router}=await import('../src/routes/admin.js');const {errorHandler}=await import('../src/middleware/error.js');
 const original=adminDb.from;let calls=0;
 adminDb.from=()=>{calls++;throw new Error('Rejected settings must not reach the database.');};
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:'fixture-owner',role:'owner'};next();});app.use('/admin',router);app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
 try{for(const key of ['auto_supplier_email_enabled','include_legacy_proxy_by_default']){const response=await fetch(`http://127.0.0.1:${server.address().port}/admin/settings/${key}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:true})});assert.equal(response.status,422);assert.match((await response.json()).error,/unavailable/);}assert.equal(calls,0);}
 finally{adminDb.from=original;await new Promise(resolve=>server.close(resolve));}
});

test('edited email sends exact quantities and escapes HTML in every editable field',async()=>{
 const {sendSupplierEmail}=await import('../src/utils/email.js');const previous=globalThis.fetch,oldFrom=adminDb.from;let delivered;
 adminDb.from=table=>{assert.equal(table,'integration_settings');return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null,error:null})};};
 globalThis.fetch=async(url,options)=>{if(url==='https://oauth2.googleapis.com/token')return new Response(JSON.stringify({access_token:'test-only-access',expires_in:3600}),{status:200});assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');const mime=Buffer.from(JSON.parse(options.body).raw,'base64url').toString();delivered={subject:Buffer.from(mime.match(/Subject: =\?UTF-8\?B\?([^?]+)/)[1],'base64').toString(),to:[{email:mime.match(/To: ([^\r\n]+)/)[1]}],htmlContent:mime.split('Content-Type: text/html; charset=UTF-8')[1]};return new Response(JSON.stringify({id:'fake-id'}),{status:200});};
 try{
 await sendSupplierEmail({supplier:{name:'Supplier',email:'supplier@example.test'},subject:'Our order',message:'Please deliver <script>bad</script>\nThank you.',items:[{part_number:'<img>',description:'Brake pad & bolts',current_stock:1,quantity:2.5,recommended_quantity:5,unit:'pcs',extra_values:{'77777777-7777-4777-8777-777777777777':'Next week <script>'}}],extra_columns:[{id:'77777777-7777-4777-8777-777777777777',label:'Delivery <date>'}]});
 assert.equal(delivered.subject,'Our order');assert.equal(delivered.to[0].email,'supplier@example.test');assert.match(delivered.htmlContent,/>2.5</);assert.ok(!delivered.htmlContent.includes('<script>'));assert.match(delivered.htmlContent,/&lt;script&gt;/);assert.match(delivered.htmlContent,/&lt;img&gt;/);assert.match(delivered.htmlContent,/Brake pad &amp; bolts/);assert.match(delivered.htmlContent,/<br>/);assert.match(delivered.htmlContent,/Delivery &lt;date&gt;/);assert.match(delivered.htmlContent,/Next week &lt;script&gt;/);assert.match(delivered.htmlContent,/>pcs</);
 }finally{globalThis.fetch=previous;adminDb.from=oldFrom;}
});
