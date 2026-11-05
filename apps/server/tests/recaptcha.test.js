import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',GMAIL_CLIENT_ID:'test-only-client',GMAIL_CLIENT_SECRET:'test-only-client-secret',GMAIL_REFRESH_TOKEN:'test-only-refresh-token',GMAIL_SENDER_EMAIL:'sender@example.test',FRONTEND_ORIGINS:'https://store.example.test',RECAPTCHA_SITE_KEY:'fixture-public-site-key',RECAPTCHA_SECRET_KEY:'fixture-private-secret'});
const {config}=await import('../src/config.js');
const {adminDb}=await import('../src/supabase.js');
const {createBotProof,validBotProof,verifyRecaptcha,publicRecaptcha}=await import('../src/utils/recaptcha.js');
const {authenticate}=await import('../src/middleware/auth.js');
const {default:login}=await import('../src/routes/login.js');
const {default:setup}=await import('../src/routes/setup.js');
const {default:express}=await import('express');
const {errorHandler}=await import('../src/middleware/error.js');
const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
const token=session=>Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({session_id:session,amr:[{method:'password'}],exp:4102444800})).toString('base64url')+'.fixture';

test('incomplete reCAPTCHA settings and public demo keys cannot silently enable production protection',()=>{
 for(const env of [
  {NODE_ENV:'development',RECAPTCHA_SECRET_KEY:''},
  {NODE_ENV:'development',RECAPTCHA_SITE_KEY:'not a valid public key'},
  {NODE_ENV:'production',RECAPTCHA_SITE_KEY:'6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'}
 ]){
  const result=spawnSync(process.execPath,['--input-type=module','-e',"await import('./src/config.js')"],{cwd:new URL('..',import.meta.url),env:{...process.env,...env},encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/RECAPTCHA_/);assert(!result.stderr.includes(config.RECAPTCHA_SECRET_KEY));
 }
});

test('bot proofs reject modification, expiry, another account and another password session',()=>{
 const proof=createBotProof(uid,sid);
 assert(validBotProof(proof.token,uid,sid));
 assert(!validBotProof(proof.token,sid,sid));
 assert(!validBotProof(proof.token,uid,uid));
 const [payload,signature]=proof.token.split('.');
 const modified=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(payload,'base64url')),userId:sid})).toString('base64url');
 assert(!validBotProof(`${modified}.${signature}`,sid,sid));
 assert(!validBotProof(`${payload}.wrong`,uid,sid));
 const now=Date.now;
 try{Date.now=()=>now()+600001;assert(!validBotProof(proof.token,uid,sid));}finally{Date.now=now;}
 assert.deepEqual(publicRecaptcha(),{siteKey:config.RECAPTCHA_SITE_KEY});
});

test('Google outages fail closed without exposing the verification secret',async()=>{
 const previous=globalThis.fetch;
 try{
  for(const value of [undefined,[],true,'short','x'.repeat(4097)])await assert.rejects(verifyRecaptcha(value),error=>error.status===422&&error.code==='CAPTCHA_REQUIRED');
  for(const result of ['network','bad-json','bad-status']){
   globalThis.fetch=async()=>{if(result==='network')throw new TypeError('private upstream data');return new Response(result==='bad-json'?'not-json':'{}',{status:result==='bad-status'?503:200});};
   await assert.rejects(verifyRecaptcha('fixture-challenge-token'),error=>error.status===503&&error.code==='CAPTCHA_UNAVAILABLE'&&!error.message.includes(config.RECAPTCHA_SECRET_KEY));
  }
 }finally{globalThis.fetch=previous;}
});

test('password and email-code routes enforce Google verification, session binding and OTP before store access',async()=>{
 const previous={fetch:globalThis.fetch,from:adminDb.from,rpc:adminDb.rpc,getUser:adminDb.auth.getUser};
 let google={success:true,hostname:'store.example.test'},googleCalls=0,passwordCalls=0,issued=0,challenge,verified=false,mailCode;
 const used=new Set();
 adminDb.auth.getUser=async()=>({data:{user:{id:uid,email:'staff@example.test'}}});
 adminDb.from=table=>({select(){return this;},eq(k,v){this[k]=v;return this;},single:async()=>({data:{id:uid,active:true,role:'owner'}}),maybeSingle:async function(){return {data:table==='login_verifications'&&verified&&this.session_id===sid?{expires_at:'2099-01-01T00:00:00Z'}:null};},then(resolve){return Promise.resolve({count:1,error:null}).then(resolve);}});
 adminDb.rpc=async(name,args)=>{
  if(name==='issue_email_challenge'){issued++;challenge=args;return {error:null};}
  if(name==='verify_email_challenge'){verified=args.p_session===sid&&args.p_hash===challenge.p_hash;return {data:{verified}};}
  throw new Error('Unexpected database call');
 };
 globalThis.fetch=async(url,options)=>{
  const address=String(url);
  if(address==='https://www.google.com/recaptcha/api/siteverify'){
   googleCalls++;assert.equal(options.body.get('secret'),config.RECAPTCHA_SECRET_KEY);
   const value=options.body.get('response'),duplicate=used.has(value);used.add(value);
   return Response.json(duplicate?{success:false,'error-codes':['timeout-or-duplicate']}:google);
  }
  if(address.startsWith('http://127.0.0.1:9/auth/v1/token')){
   passwordCalls++;const body=JSON.parse(options.body),ok=body.password==='fixture-correct-password';
   return Response.json(ok?{access_token:token(sid),refresh_token:'fixture-refresh',expires_in:3600,token_type:'bearer',user:{id:uid,email:'staff@example.test'}}:{error:'invalid_grant',error_description:'Invalid login credentials'},{status:ok?200:400});
  }
  if(address==='https://oauth2.googleapis.com/token')return Response.json({access_token:'fixture-google-access',expires_in:3600,scope:'https://www.googleapis.com/auth/gmail.send'});
  if(address==='https://gmail.googleapis.com/gmail/v1/users/me/messages/send'){
   const mime=Buffer.from(JSON.parse(options.body).raw,'base64url').toString();mailCode=mime.match(/code is (\d{6})/)[1];return Response.json({id:'fixture-message'});
  }
  if(address.startsWith('http://127.0.0.1:'))return previous.fetch(url,options);
  throw new Error('Unexpected network request');
 };
 const app=express();app.use(express.json());app.use('/setup',setup);app.use('/auth',login);app.get('/private',authenticate,(_req,res)=>res.json({ok:true}));app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body,session=sid)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token(session)}`},body:JSON.stringify(body)});
 const password=(captchaToken,password='fixture-correct-password')=>post('/auth/password',{email:'staff@example.test',password,captchaToken});
 try{
  const status=await(await fetch(base+'/setup/status')).json();assert.equal(status.captcha.siteKey,config.RECAPTCHA_SITE_KEY);assert(!JSON.stringify(status).includes(config.RECAPTCHA_SECRET_KEY));
  assert.equal((await password('short')).status,422);assert.equal(passwordCalls,0);
  google={success:false,'error-codes':['timeout-or-duplicate']};assert.equal((await password('fixture-expired-token')).status,422);assert.equal(passwordCalls,0);
  google={success:true,hostname:'attacker.example.test'};assert.equal((await password('fixture-wrong-host-token')).status,422);assert.equal(passwordCalls,0);
  google={success:true,hostname:'store.example.test'};assert.equal((await password('fixture-wrong-password-token','wrong')).status,401);assert.equal(passwordCalls,1);
  assert.equal((await password('fixture-wrong-password-token')).status,422);assert.equal(passwordCalls,1);
  const response=await password('fixture-valid-password-token');assert.equal(response.status,200);const signedIn=await response.json();assert(signedIn.session.access_token);assert(signedIn.session.refresh_token);assert(validBotProof(signedIn.botProof.token,uid,sid));
  assert.equal((await post('/auth/otp/request',{})).status,422);assert.equal(issued,0);
  assert.equal((await post('/auth/otp/request',{botProof:signedIn.botProof.token},uid)).status,422);assert.equal(issued,0);
  const before=googleCalls;const sent=await post('/auth/otp/request',{botProof:signedIn.botProof.token});assert.equal(sent.status,200);assert.equal(issued,1);assert.equal(googleCalls,before);assert.equal((await sent.json()).botProof,undefined);
  assert.equal((await fetch(base+'/private',{headers:{authorization:`Bearer ${token(sid)}`}})).status,428);
  assert.equal((await post('/auth/otp/verify',{code:mailCode==='000000'?'111111':'000000'})).status,422);
  assert.equal((await post('/auth/otp/verify',{code:mailCode})).status,200);
  assert.equal((await fetch(base+'/private',{headers:{authorization:`Bearer ${token(sid)}`}})).status,200);
  const refreshed=await post('/auth/otp/request',{captchaToken:'fixture-fresh-reload-token'});assert.equal(refreshed.status,200);assert(validBotProof((await refreshed.json()).botProof.token,uid,sid));
 }finally{await new Promise(r=>server.close(r));globalThis.fetch=previous.fetch;Object.assign(adminDb,{from:previous.from,rpc:previous.rpc});adminDb.auth.getUser=previous.getUser;}
});
