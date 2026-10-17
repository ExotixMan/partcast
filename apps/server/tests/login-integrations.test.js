import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-chars-long',GMAIL_CLIENT_ID:'test-only-client-id',GMAIL_CLIENT_SECRET:'test-only-client-secret',GMAIL_REFRESH_TOKEN:'test-only-refresh-token',GMAIL_SENDER_EMAIL:'sender@example.test',GEMINI_API_KEY:'test-only-gemini-key'});
const {adminDb}=await import('../src/supabase.js');
const {config}=await import('../src/config.js');
const {authenticate}=await import('../src/middleware/auth.js');
const {encryptIntegration,decryptIntegration,integrationStatuses,saveIntegration,clearIntegrationCache}=await import('../src/utils/integrations.js');
const {default:login}=await import('../src/routes/login.js');
const {default:admin}=await import('../src/routes/admin.js');
const {default:express}=await import('express');
const {errorHandler}=await import('../src/middleware/error.js');
const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
const token=(session=sid,method='password')=>Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({session_id:session,amr:[{method}]})).toString('base64url')+'.stubbed-signature';
test('encrypted API secrets are masked, preserved on blank updates and reject tampering',async()=>{
 const previous=adminDb.from,rows=new Map();
 adminDb.from=table=>({select(){return this;},eq(_k,v){this.id=v;return this;},maybeSingle:async function(){return {data:rows.get(this.id)||null};},upsert:async row=>{rows.set(row.provider,row);return {error:null};}});
 clearIntegrationCache();
 try{
  const ciphertext=encryptIntegration({secret:'do-not-expose'});assert(!ciphertext.includes('do-not-expose'));assert.deepEqual(decryptIntegration(ciphertext),{secret:'do-not-expose'});
  const parts=ciphertext.split('.');parts[1]=Buffer.alloc(16).toString('base64url');assert.throws(()=>decryptIntegration(parts.join('.')));
  await saveIntegration('gemini',{api_key:'new-test-only-gemini-key',model:'gemini-2.5-flash',enabled:true},uid);
  await saveIntegration('gemini',{api_key:'',enabled:true},uid);
  assert.equal(decryptIntegration(rows.get('gemini').encrypted_config).api_key,'new-test-only-gemini-key');
  const statuses=await integrationStatuses();assert.equal(statuses.find(x=>x.provider==='gemini').fields.api_key,true);assert(!JSON.stringify(statuses).includes('new-test-only-gemini-key'));
  await assert.rejects(saveIntegration('gmail',{sender_email:'bad\r\nBcc:evil@example.test'},uid));
  await assert.rejects(saveIntegration('gmail',{enabled:false},uid),/must remain enabled/);
  await assert.rejects(saveIntegration('gemini',{model:'https://evil.example/key'},uid));
 }finally{adminDb.from=previous;clearIntegrationCache();}
});
test('password then Gmail code is enforced on HTTP requests; wrong session, wrong code and Owner IT access are denied',async()=>{
 const previous={from:adminDb.from,auth:adminDb.auth.getUser,rpc:adminDb.rpc,fetch:globalThis.fetch};
 let verified=false,role='owner',challenge,mailCode;const outbound=[];
 adminDb.auth.getUser=async t=>t.split('.').length===3?{data:{user:{id:uid,email:'staff@example.test'}}}:{data:{user:null},error:new Error('invalid')};
 adminDb.from=table=>({select(){return this;},eq(k,v){this[k]=v;return this;},delete(){if(table==='login_verifications')verified=false;return this;},single:async()=>({data:{id:uid,role,active:true,full_name:'Staff'}}),maybeSingle:async function(){return {data:table==='login_verifications'&&verified&&this.session_id===sid?{expires_at:'2099-01-01T00:00:00Z'}:null};},then(resolve){return Promise.resolve({data:null,error:null}).then(resolve);}});
 adminDb.rpc=async(name,args)=>{if(name==='issue_email_challenge'){challenge=args;return {error:null};}if(name==='verify_email_challenge'){verified=args.p_session===challenge.p_session&&args.p_hash===challenge.p_hash;return {data:{verified,error:'The code is incorrect.'}};}throw new Error('Unexpected RPC');};
 globalThis.fetch=async(url,options)=>{
  if(String(url).startsWith('http://127.0.0.1:'))return previous.fetch(url,options);
  outbound.push({url:String(url),options});
  if(String(url)==='https://oauth2.googleapis.com/token')return new Response(JSON.stringify({access_token:'test-only-google-access',expires_in:3600,scope:'https://www.googleapis.com/auth/gmail.send'}),{status:200});
  if(String(url)==='https://gmail.googleapis.com/gmail/v1/users/me/messages/send'){const mime=Buffer.from(JSON.parse(options.body).raw,'base64url').toString();assert(mime.includes('To: staff@example.test'));assert(!mime.includes('attacker@example.test'));mailCode=mime.match(/code is (\d{6})/)[1];return new Response('{}',{status:200});}
  throw new Error('Unexpected external request');
 };
 clearIntegrationCache();
 const app=express();app.use(express.json());app.use('/auth',login);app.get('/private',authenticate,(req,res)=>res.json({ok:true}));app.use('/api/admin',authenticate,admin);app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const get=(path,t=token())=>fetch(base+path,{headers:{Authorization:`Bearer ${t}`}}),post=(path,body,t=token())=>fetch(base+path,{method:'POST',headers:{Authorization:`Bearer ${t}`,'content-type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await get('/private')).status,428);
  assert.equal((await post('/auth/otp/request',{},token(sid,'otp'))).status,401);assert.equal(outbound.length,0);
  assert.equal((await post('/auth/otp/request',{email:'attacker@example.test'})).status,200);
  assert.equal(outbound.length,2);assert.equal(new URLSearchParams(outbound[0].options.body).get('grant_type'),'refresh_token');
  assert.equal(challenge.p_hash,crypto.createHmac('sha256',config.INTEGRATION_ENCRYPTION_KEY).update(`${uid}:${sid}:${mailCode}`).digest('hex'));assert.equal(challenge.code,undefined);
  assert.equal((await post('/auth/otp/verify',{code:'invalid'})).status,400);
  const wrong=mailCode==='000000'?'111111':'000000';assert.equal((await post('/auth/otp/verify',{code:wrong})).status,422);assert.equal((await get('/private')).status,428);
  assert.equal((await post('/auth/otp/verify',{code:mailCode})).status,200);assert.equal((await get('/private')).status,200);
  assert.equal((await get('/private',token(uid))).status,428);
  assert.equal((await get('/api/admin/integrations')).status,403);
  assert.equal((await post('/api/admin/users',{fullName:'Fake IT',email:'fake@example.test',password:'test-only-password',role:'super_admin'})).status,403);
  role='super_admin';const status=await get('/api/admin/integrations');assert.equal(status.status,200);const body=await status.json();assert(body.data.find(v=>v.provider==='gmail').ready);assert(!JSON.stringify(body).includes('test-only-client-secret'));
  assert.equal((await post('/auth/logout',{})).status,200);assert.equal((await get('/private')).status,428);
 }finally{await new Promise(r=>server.close(r));Object.assign(adminDb,{from:previous.from,rpc:previous.rpc});adminDb.auth.getUser=previous.auth;globalThis.fetch=previous.fetch;clearIntegrationCache();}
});
