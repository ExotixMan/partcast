import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import nodemailer from 'nodemailer';

Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters',GMAIL_CLIENT_ID:'fixture-client',GMAIL_CLIENT_SECRET:'fixture-client-secret',GMAIL_REFRESH_TOKEN:'fixture-refresh',GMAIL_SENDER_EMAIL:'sender@example.test',GMAIL_DELIVERY_METHOD:'oauth'});
const {adminDb}=await import('../src/supabase.js');
const {config}=await import('../src/config.js');
const {encryptIntegration,decryptIntegration,saveIntegration,integrationStatuses,getIntegration,clearIntegrationCache}=await import('../src/utils/integrations.js');
const {sendLoginCode,checkGmailConnection}=await import('../src/utils/gmail.js');
const {sendSupplierEmail}=await import('../src/utils/email.js');
const {appsScriptUrlSchema,appsScriptSecretSchema}=await import('../src/utils/gmail-config.js');
const script=readFileSync(new URL('../../web/public/email-setup/Code.gs',import.meta.url),'utf8');
const key='a'.repeat(64),url='https://script.google.com/macros/s/FixturePartCastDeployment123456789/exec';
const relay={enabled:true,delivery_method:'apps_script',sender_email:'sender@example.test',script_url:url,script_secret:key};
const nativeFetch=globalThis.fetch;

function google(){
 const stored=new Map([['PARTCAST_MAIL_SECRET',key]]),deliveries=[];
 let remaining=100,busy=false,failSend=false,failReceipt=false;
 const property={getProperty:name=>stored.get(name)||null,setProperty(name,value){if(failReceipt&&name.startsWith('partcast_mail_')&&JSON.parse(value).state==='sent')throw new Error('PRIVATE_PROPERTY_FAILURE');stored.set(name,value);},deleteProperty:name=>stored.delete(name),getProperties:()=>Object.fromEntries(stored)};
 const context=vm.createContext({
  PropertiesService:{getScriptProperties:()=>property},
  Session:{getEffectiveUser:()=>({getEmail:()=>relay.sender_email})},
  MailApp:{getRemainingDailyQuota:()=>remaining,sendEmail:message=>{deliveries.push(JSON.parse(JSON.stringify(message)));remaining--;if(failSend)throw new Error('PRIVATE_PROVIDER_FAILURE '+key);}},
  LockService:{getScriptLock:()=>{let locked=false;return {tryLock:()=>locked=!busy,hasLock:()=>locked,releaseLock:()=>locked=false};}},
  ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({text,setMimeType(){return this;}})},
  Utilities:{Charset:{UTF_8:'UTF-8'},computeHmacSha256Signature:(payload,secret)=>crypto.createHmac('sha256',secret).update(payload).digest(),base64EncodeWebSafe:value=>Buffer.from(value).toString('base64url'),base64DecodeWebSafe:value=>Buffer.from(value,'base64url'),newBlob:value=>({getDataAsString:()=>Buffer.from(value).toString('utf8')})}
 });
 vm.runInContext(script,context);
 return {stored,deliveries,call:body=>JSON.parse(context.doPost({postData:{contents:typeof body==='string'?body:JSON.stringify(body)}}).text),authorize:()=>context.authorizePartCast(),setQuota:value=>remaining=value,setBusy:value=>busy=value,setFailSend:value=>failSend=value,setFailReceipt:value=>failReceipt=value};
}
function signed(patch={},secret=key){
 const value={version:1,action:'send',request_id:crypto.randomUUID(),issued_at:Date.now(),sender_email:relay.sender_email,message:{to:'staff@example.test',subject:'Sign-in code',text:'Code 654321'},...patch};
 const payload=Buffer.from(JSON.stringify(value)).toString('base64url');
 return {payload,signature:crypto.createHmac('sha256',secret).update(payload).digest('base64url')};
}
function fixture(saved=relay){
 const previous={from:adminDb.from,fetch:globalThis.fetch,create:nodemailer.createTransport,method:config.GMAIL_DELIVERY_METHOD,url:config.GMAIL_APPS_SCRIPT_URL,key:config.GMAIL_APPS_SCRIPT_SECRET};
 const service=google(),requests=[];let row=saved?{provider:'gmail',enabled:true,encrypted_config:encryptIntegration(saved)}:null,writes=0,reply;
 adminDb.from=table=>{assert.equal(table,'integration_settings');return {select(){return this;},eq(_key,id){this.id=id;return this;},maybeSingle:async function(){return {data:this.id==='gmail'?row:null,error:null};},upsert:async next=>{row=next;writes++;return {error:null};}};};
 nodemailer.createTransport=()=>assert.fail('Apps Script must not open an SMTP connection.');
 globalThis.fetch=async(endpoint,options)=>{
  if(String(endpoint).startsWith('http://127.0.0.1:'))return nativeFetch(endpoint,options);
  assert.equal(endpoint,url);assert.equal(options.method,'POST');assert.equal(options.redirect,'follow');
  const envelope=JSON.parse(options.body);assert(!options.body.includes(key));requests.push(envelope);
  if(reply)return reply(envelope,options);
  return new Response(JSON.stringify(service.call(envelope)),{status:200});
 };
 clearIntegrationCache();
 return {service,requests,get row(){return row;},get writes(){return writes;},reply:value=>reply=value,restore(){adminDb.from=previous.from;globalThis.fetch=previous.fetch;nodemailer.createTransport=previous.create;config.GMAIL_DELIVERY_METHOD=previous.method;config.GMAIL_APPS_SCRIPT_URL=previous.url;config.GMAIL_APPS_SCRIPT_SECRET=previous.key;clearIntegrationCache();}};
}

test('the actual Apps Script sends signed login and supplier messages, checks without mail, and rejects replay duplication',async()=>{
 const f=fixture();
 try{
  assert.match(await checkGmailConnection(),/Apps Script access is valid/);assert.equal(f.service.deliveries.length,0);
  await sendLoginCode('staff@example.test','654321');
  await sendSupplierEmail({supplier:{name:'Supplier',email:'supplier@example.test'},subject:'Parts request',message:'Please confirm <script>bad</script>',items:[{part_number:'BP-001',description:'Brake pad & bolts',current_stock:0,quantity:2,unit:'pc'}]});
  assert.equal(f.service.deliveries.length,2);assert.equal(f.service.deliveries[0].to,'staff@example.test');assert.match(f.service.deliveries[0].body,/654321/);
  assert.match(f.service.deliveries[1].htmlBody,/&lt;script&gt;/);assert(!f.service.deliveries[1].htmlBody.includes('<script>'));
  const replay=f.service.call(f.requests[1]);assert.equal(replay.sent,true);assert.equal(f.service.deliveries.length,2);
  const metadata=JSON.stringify([...f.service.stored].filter(([name])=>name.startsWith('partcast_mail_')));
  for(const privateValue of ['654321','staff@example.test','supplier@example.test','Sign-in code'])assert(!metadata.includes(privateValue));
 }finally{f.restore();}
});

test('Apps Script rejects unsigned, wrong-key, altered, stale, mismatched-sender and multi-recipient requests before mail',()=>{
 const service=google(),valid=signed();
 const altered=signed();altered.payload=Buffer.from(JSON.stringify({action:'send',message:{to:'attacker@example.test'}})).toString('base64url');
 for(const request of ['not-json',{},signed({},'b'.repeat(64)),altered,signed({issued_at:Date.now()-301000}),signed({issued_at:Date.now()+301000}),signed({sender_email:'different@example.test'}),signed({message:{to:'staff@example.test,other@example.test',subject:'Code',text:'hello'}}),signed({message:{to:'staff@example.test',subject:'Code\r\nBcc: other@example.test',text:'hello'}})])assert.equal(service.call(request).ok,false);
 assert.equal(service.deliveries.length,0);
 assert.equal(service.call(valid).sent,true);assert.equal(service.deliveries.length,1);
 const changed=signed({...JSON.parse(Buffer.from(valid.payload,'base64url')),message:{to:'other@example.test',subject:'Other code',text:'different'}});
 assert.equal(service.call(changed).error,'INVALID_REQUEST');assert.equal(service.deliveries.length,1);
});

test('a lost or failed Apps Script submission stays uncertain and the same signed request is never sent twice',async()=>{
 for(const mode of ['send','receipt']){
  const f=fixture();
  try{
   if(mode==='send')f.service.setFailSend(true);else f.service.setFailReceipt(true);
   await assert.rejects(sendLoginCode('staff@example.test','654321'),error=>{assert.equal(error.code,'GMAIL_SCRIPT_UNCONFIRMED');assert.equal(error.deliveryUncertain,true);assert(!JSON.stringify(error).includes('PRIVATE_'));return true;});
   assert.equal(f.service.deliveries.length,1);assert.equal(f.service.call(f.requests[0]).error,'UNCONFIRMED');assert.equal(f.service.deliveries.length,1);
  }finally{f.restore();}
 }
 const f=fixture();
 try{
  f.reply(()=>{throw new Error('PRIVATE_FETCH '+key);});
  await assert.rejects(sendLoginCode('staff@example.test','654321'),error=>error.code==='GMAIL_SCRIPT_UNCONFIRMED'&&error.deliveryUncertain===true&&!JSON.stringify(error).includes(key));
 }finally{f.restore();}
});

test('Apps Script checks are authenticated and quota or lock failures never send mail',async()=>{
 const f=fixture();
 try{
  assert.equal(f.service.authorize().remaining,100);assert.equal(f.service.deliveries.length,0);
  f.service.setQuota(0);
  await assert.rejects(checkGmailConnection(),error=>error.code==='GMAIL_SCRIPT_QUOTA_EXCEEDED');
  await assert.rejects(sendLoginCode('staff@example.test','654321'),error=>error.code==='GMAIL_SCRIPT_QUOTA_EXCEEDED'&&error.deliveryUncertain===false);
  f.service.setQuota(100);f.service.setBusy(true);
  await assert.rejects(sendLoginCode('staff@example.test','654321'),error=>error.code==='GMAIL_SCRIPT_BUSY'&&error.deliveryUncertain===false);
  assert.equal(f.service.deliveries.length,0);
 }finally{f.restore();}
});

test('Apps Script settings check before saving, encrypt secrets and preserve the previous settings on failure',async()=>{
 const f=fixture({client_id:'old-client',client_secret:'old-secret',refresh_token:'old-refresh',sender_email:relay.sender_email});
 try{
  f.service.stored.set('PARTCAST_MAIL_SECRET','b'.repeat(64));
  await assert.rejects(saveIntegration('gmail',relay,'super-admin'),error=>error.code==='GMAIL_SCRIPT_AUTH_FAILED');assert.equal(f.writes,0);
  assert.equal((await getIntegration('gmail')).delivery_method,'oauth');
  f.service.stored.set('PARTCAST_MAIL_SECRET',key);
  const status=await saveIntegration('gmail',relay,'super-admin');
  assert.equal(f.writes,1);assert.equal(status.ready,true);assert.equal(status.apps_script_supported,true);assert.equal(status.fields.script_secret,true);assert.equal(status.delivery_method,'apps_script');
  assert.equal(decryptIntegration(f.row.encrypted_config).script_secret,key);assert(!f.row.encrypted_config.includes(key));
  const visible=JSON.stringify(await integrationStatuses());assert(!visible.includes(key));assert(!visible.includes(url));assert.equal(f.service.deliveries.length,0);
  await saveIntegration('gmail',{script_secret:'',script_url:''},'super-admin');assert.equal(decryptIntegration(f.row.encrypted_config).script_secret,key);
 }finally{f.restore();}
});

test('Apps Script environment fallback works while legacy saved connections retain OAuth',async()=>{
 const f=fixture(null);
 try{
  config.GMAIL_DELIVERY_METHOD='apps_script';config.GMAIL_APPS_SCRIPT_URL=url;config.GMAIL_APPS_SCRIPT_SECRET=key;clearIntegrationCache();
  assert.equal((await integrationStatuses())[0].delivery_method,'apps_script');await sendLoginCode('staff@example.test','654321');assert.equal(f.service.deliveries.length,1);
 }finally{f.restore();}
 const legacy=fixture({client_id:'saved-client',client_secret:'saved-secret',refresh_token:'saved-refresh',sender_email:relay.sender_email});
 try{config.GMAIL_DELIVERY_METHOD='apps_script';config.GMAIL_APPS_SCRIPT_URL=url;config.GMAIL_APPS_SCRIPT_SECRET=key;clearIntegrationCache();assert.equal((await integrationStatuses())[0].delivery_method,'oauth');assert.equal(legacy.requests.length,0);}finally{legacy.restore();}
});

test('Apps Script only accepts deployed Google HTTPS URLs and strong single-line keys',()=>{
 assert.equal(appsScriptUrlSchema.safeParse(url).success,true);
 for(const candidate of ['http://127.0.0.1:9/exec','https://script.google.com.evil.test/macros/s/'+('x'.repeat(30))+'/exec',url+'?key=private',url.replace('/exec','/dev'),url.replace('https://','http://'),url+'\r\nHeader: bad'])assert.equal(appsScriptUrlSchema.safeParse(candidate).success,false);
 for(const candidate of ['short','a'.repeat(31),'a'.repeat(32)+'\nbad','a'.repeat(32)+' bad'])assert.equal(appsScriptSecretSchema.safeParse(candidate).success,false);
});

test('unexpected Google HTML or errors are controlled and cannot expose provider text or credentials',async()=>{
 const f=fixture();
 try{
  for(const response of [()=>new Response('<html>PRIVATE_PROVIDER '+key+'</html>'),()=>new Response(JSON.stringify({ok:false,error:'PRIVATE_PROVIDER '+key}),{status:500})]){
   f.reply(response);
   await assert.rejects(checkGmailConnection(),error=>error.code==='GMAIL_SCRIPT_UNAVAILABLE'&&!JSON.stringify(error).includes('PRIVATE_PROVIDER')&&!JSON.stringify(error).includes(key));
   await assert.rejects(sendLoginCode('staff@example.test','654321'),error=>error.deliveryUncertain===true&&!JSON.stringify(error).includes(key));
  }
 }finally{f.restore();}
});

test('Apps Script OTP failures remove the exact challenge and recovery still requires a delivered matching code',async()=>{
 const {default:express}=await import('express');
 const {default:login}=await import('../src/routes/login.js');
 const {authenticate}=await import('../src/middleware/auth.js');
 const {errorHandler}=await import('../src/middleware/error.js');
 const f=fixture(),previous={from:adminDb.from,rpc:adminDb.rpc,auth:adminDb.auth.getUser,log:console.error};
 const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
 let challenge,deleted=0,verified=false;const filters=[],logs=[];
 adminDb.auth.getUser=async()=>({data:{user:{id:uid,email:'staff@example.test'}}});
 adminDb.from=table=>table==='integration_settings'?previous.from(table):({select(){return this;},eq(name,value){this[name]=value;if(table==='email_login_challenges')filters.push([name,value]);return this;},delete(){deleted++;return this;},single:async()=>({data:{id:uid,active:true,role:'owner'}}),maybeSingle:async()=>({data:table==='login_verifications'&&verified?{expires_at:'2099-01-01T00:00:00Z'}:null,error:null}),then(resolve){return Promise.resolve({error:null}).then(resolve);}});
 adminDb.rpc=async(name,args)=>{if(name==='issue_email_challenge'){challenge=args;return {error:null};}if(name==='verify_email_challenge'){verified=args.p_session===challenge.p_session&&args.p_hash===challenge.p_hash;return {data:{verified,error:'The code is incorrect.'}};}assert.fail(name);};
 console.error=(...args)=>logs.push(args);
 const app=express();app.use(express.json());app.use('/auth',login);app.get('/private',authenticate,(_req,res)=>res.json({ok:true}));app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}`,token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({session_id:sid,amr:[{method:'password'}]})).toString('base64url')+'.fixture',headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 const post=(path,body={})=>nativeFetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});
 try{
  f.service.stored.set('PARTCAST_MAIL_SECRET','b'.repeat(64));
  let response=await post('/auth/otp/request');let body=await response.json();assert.equal(response.status,503);assert.equal(body.code,'GMAIL_SCRIPT_AUTH_FAILED');assert.equal(deleted,1);assert.deepEqual(filters,[['session_id',sid],['code_hash',challenge.p_hash]]);assert.equal((await nativeFetch(base+'/private',{headers})).status,428);
  f.service.stored.set('PARTCAST_MAIL_SECRET',key);response=await post('/auth/otp/request');assert.equal(response.status,200);assert.equal((await nativeFetch(base+'/private',{headers})).status,428);
  const code=f.service.deliveries[0].body.match(/code is (\d{6})/)[1],wrong=code==='000000'?'111111':'000000';
  assert.equal((await post('/auth/otp/verify',{code:wrong})).status,422);assert.equal((await nativeFetch(base+'/private',{headers})).status,428);
  assert.equal((await post('/auth/otp/verify',{code})).status,200);assert.equal((await nativeFetch(base+'/private',{headers})).status,200);
  assert(!JSON.stringify({body,logs}).includes(key));
 }finally{await new Promise(resolve=>server.close(resolve));adminDb.from=previous.from;adminDb.rpc=previous.rpc;adminDb.auth.getUser=previous.auth;console.error=previous.log;f.restore();}
});
