import {test} from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
const nativeFetch=globalThis.fetch;

Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters',GMAIL_CLIENT_ID:'fixture-client',GMAIL_CLIENT_SECRET:'fixture-client-secret',GMAIL_REFRESH_TOKEN:'fixture-refresh',GMAIL_SENDER_EMAIL:'sender@example.test',GMAIL_DELIVERY_METHOD:'oauth',GMAIL_APP_PASSWORD:''});
const {adminDb}=await import('../src/supabase.js');
const {config}=await import('../src/config.js');
const {encryptIntegration,decryptIntegration,saveIntegration,integrationStatuses,getIntegration,clearIntegrationCache}=await import('../src/utils/integrations.js');
const {sendLoginCode,sendGmailMessage,checkGmailConnection}=await import('../src/utils/gmail.js');
const {sendSupplierEmail}=await import('../src/utils/email.js');
const {googleAppPasswordSchema}=await import('../src/utils/gmail-config.js');
const password='abcdefghijklmnop';
const smtp={enabled:true,delivery_method:'smtp',sender_email:'sender@example.test',app_password:password};

function fixture(saved=smtp){
 const previous={from:adminDb.from,create:nodemailer.createTransport,fetch:globalThis.fetch,method:config.GMAIL_DELIVERY_METHOD,password:config.GMAIL_APP_PASSWORD};
 let row=saved?{provider:'gmail',enabled:true,encrypted_config:encryptIntegration(saved)}:null;
 const options=[],deliveries=[];let checks=0,closed=0,writes=0,verifyError=null,sendError=null,result=null;
 adminDb.from=table=>{
  assert.equal(table,'integration_settings');
  return {select(){return this;},eq(_key,id){this.id=id;return this;},maybeSingle:async function(){return {data:this.id==='gmail'?row:null,error:null};},upsert:async next=>{row=next;writes++;return {error:null};}};
 };
 globalThis.fetch=async()=>{throw new Error('SMTP must not call the Gmail OAuth or HTTP send endpoints.');};
 nodemailer.createTransport=value=>{
  options.push(value);
  return {verify:async()=>{checks++;if(verifyError)throw verifyError;return true;},sendMail:async mail=>{
   deliveries.push(mail);if(sendError)throw sendError;
   return result||{accepted:[mail.to],rejected:[],response:'250 2.0.0 OK fixture',messageId:'<fixture@example.test>'};
  },close(){closed++;}};
 };
 clearIntegrationCache();
 return {options,deliveries,get row(){return row;},get checks(){return checks;},get closed(){return closed;},get writes(){return writes;},
  failVerify:error=>verifyError=error,failSend:error=>sendError=error,result:value=>result=value,
  restore(){adminDb.from=previous.from;nodemailer.createTransport=previous.create;globalThis.fetch=previous.fetch;config.GMAIL_DELIVERY_METHOD=previous.method;config.GMAIL_APP_PASSWORD=previous.password;clearIntegrationCache();}};
}

test('SMTP sends login codes and escaped supplier mail over authenticated TLS without OAuth or automatic fallback',async()=>{
 const f=fixture();
 try{
  await sendLoginCode('staff@example.test','123456');
  await sendSupplierEmail({supplier:{name:'Supplier',email:'supplier@example.test'},subject:'Parts request',message:'Please confirm <script>bad</script>',items:[{part_number:'BP-001',description:'Brake pad & bolts',current_stock:0,quantity:2,unit:'pc'}]});
  assert.equal(f.deliveries.length,2);assert.equal(f.checks,0);assert.equal(f.closed,2);
  assert.equal(f.deliveries[0].to,'staff@example.test');assert.match(f.deliveries[0].text,/123456/);
  assert.deepEqual(f.deliveries[0].envelope,{from:'sender@example.test',to:['staff@example.test']});
  assert.equal(f.deliveries[1].to,'supplier@example.test');assert.match(f.deliveries[1].html,/&lt;script&gt;/);assert(!f.deliveries[1].html.includes('<script>'));
  for(const value of f.options){
   assert.equal(value.host,'smtp.gmail.com');assert.equal(value.port,465);assert.equal(value.secure,true);assert.equal(value.forceAuth,true);
   assert.deepEqual(value.auth,{user:'sender@example.test',pass:password});assert.equal(value.tls.rejectUnauthorized,true);assert.equal(value.tls.minVersion,'TLSv1.2');
   assert.equal(value.disableFileAccess,true);assert.equal(value.disableUrlAccess,true);assert.equal(value.logger,false);assert.equal(value.debug,false);
  }
  assert.match(await checkGmailConnection(),/SMTP sign-in is valid/);assert.equal(f.checks,1);assert.equal(f.deliveries.length,2);
 }finally{f.restore();}
});
test('SMTP settings verify before saving, encrypt the App Password and preserve a saved blank secret',async()=>{
 const f=fixture({client_id:'old-client',client_secret:'old-client-secret',refresh_token:'old-refresh',sender_email:'sender@example.test'});
 try{
  const status=await saveIntegration('gmail',{delivery_method:'smtp',sender_email:'sender@example.test',app_password:'abcd efgh ijkl mnop'},'super-admin');
  assert.equal(status.delivery_method,'smtp');assert.equal(status.smtp_supported,true);assert.equal(status.ready,true);assert.equal(status.fields.app_password,true);
  assert.equal(f.checks,1);assert.equal(f.writes,1);assert.equal(f.deliveries.length,0);
  assert.equal(decryptIntegration(f.row.encrypted_config).app_password,password);assert(!f.row.encrypted_config.includes(password));
  assert(!JSON.stringify(await integrationStatuses()).includes(password));
  await saveIntegration('gmail',{delivery_method:'smtp',app_password:''},'super-admin');
  assert.equal(decryptIntegration(f.row.encrypted_config).app_password,password);assert.equal(f.checks,2);
 }finally{f.restore();}
});

test('a blocked SMTP host or rejected App Password never replaces the saved working connection',async()=>{
 for(const error of [Object.assign(new Error('private connection detail'),{code:'ETIMEDOUT',command:'CONN'}),Object.assign(new Error('private '+password),{code:'EAUTH',command:'AUTH PLAIN',responseCode:535})]){
  const f=fixture({client_id:'old-client',client_secret:'old-secret',refresh_token:'old-refresh',sender_email:'sender@example.test'});
  try{
   const original=f.row.encrypted_config;f.failVerify(error);
   await assert.rejects(saveIntegration('gmail',{delivery_method:'smtp',app_password:password},'super-admin'),failure=>{
    assert.equal(failure.safe,true);assert.equal(failure.deliveryUncertain,false);assert(!failure.message.includes(password));return true;
   });
   assert.equal(f.writes,0);assert.equal(f.row.encrypted_config,original);assert.equal((await integrationStatuses())[0].delivery_method,'oauth');assert.equal(f.closed,1);
  }finally{f.restore();}
 }
});

test('legacy saved OAuth settings remain OAuth even when SMTP environment fallback is configured',async()=>{
 const f=fixture({client_id:'saved-client',client_secret:'saved-secret',refresh_token:'saved-refresh',sender_email:'sender@example.test'});
 try{
  config.GMAIL_DELIVERY_METHOD='smtp';config.GMAIL_APP_PASSWORD=password;clearIntegrationCache();
  const status=(await integrationStatuses())[0];assert.equal(status.delivery_method,'oauth');assert.equal(status.ready,true);assert.equal(f.options.length,0);
  assert.equal((await getIntegration('gmail')).refresh_token,'saved-refresh');
 }finally{f.restore();}
 const fallback=fixture(null);
 try{config.GMAIL_DELIVERY_METHOD='smtp';config.GMAIL_APP_PASSWORD=password;clearIntegrationCache();assert.equal((await integrationStatuses())[0].delivery_method,'smtp');await sendLoginCode('staff@example.test','654321');assert.equal(fallback.deliveries.length,1);}
 finally{fallback.restore();}
});

test('SMTP rejects invalid credentials and recipient/header injection before connecting',async()=>{
 const f=fixture();
 try{
  assert.equal(googleAppPasswordSchema.parse('abcd efgh ijkl mnop'),password);
  for(const value of ['too-short','abcd\nefghijklmnop','abcdefghijklmnop!'])assert.equal(googleAppPasswordSchema.safeParse(value).success,false);
  await assert.rejects(sendGmailMessage({to:'staff@example.test\r\nBcc:evil@example.test',subject:'Code',text:'hello'}));
  await assert.rejects(sendGmailMessage({to:'staff@example.test',subject:'Code\r\nBcc:evil@example.test',text:'hello'}));
  await assert.rejects(saveIntegration('gmail',{delivery_method:'other',app_password:password},'admin'));
  await assert.rejects(saveIntegration('gmail',{app_password:'short'},'admin'));assert.equal(f.options.length,0);
 }finally{f.restore();}
});

test('SMTP delivery errors distinguish safe retries from uncertain DATA submission without exposing upstream secrets',async t=>{
 const cases=[
  {name:'authentication rejected',error:{code:'EAUTH',command:'AUTH LOGIN',responseCode:535},code:'GMAIL_SMTP_AUTH_FAILED',uncertain:false},
  {name:'connection refused',error:{code:'ECONNREFUSED',command:'CONN'},code:'GMAIL_SMTP_UNAVAILABLE',uncertain:false},
  {name:'recipient refused',error:{code:'EENVELOPE',command:'RCPT TO',responseCode:550},code:'GMAIL_SMTP_REJECTED',uncertain:false},
  {name:'explicit message rejection',error:{code:'EMESSAGE',command:'DATA',responseCode:554},code:'GMAIL_SMTP_REJECTED',uncertain:false},
  {name:'DATA response interrupted',error:{code:'ETIMEDOUT',command:'DATA'},code:'GMAIL_SMTP_UNCONFIRMED',uncertain:true},
  {name:'unknown disconnect',error:{code:'ESOCKET'},code:'GMAIL_SMTP_UNCONFIRMED',uncertain:true},
  {name:'a generic CONN error can follow DATA submission',error:{code:'ECONNRESET',command:'CONN'},code:'GMAIL_SMTP_UNCONFIRMED',uncertain:true}
 ];
 for(const scenario of cases)await t.test(scenario.name,async()=>{
  const f=fixture();
  try{
   f.failSend(Object.assign(new Error('upstream '+password),scenario.error));
   await assert.rejects(sendLoginCode('staff@example.test','123456'),failure=>{
    assert.equal(failure.code,scenario.code);assert.equal(failure.deliveryUncertain,scenario.uncertain);assert.equal(failure.safe,true);
    assert(!JSON.stringify({message:failure.message,details:failure.details,stack:failure.stack}).includes(password));return true;
   });
   assert.equal(f.deliveries.length,1);assert.equal(f.closed,1);
  }finally{f.restore();}
 });
});

test('a missing SMTP acceptance is uncertain and never reported as sent',async()=>{
 const f=fixture();
 try{f.result({accepted:[],response:'250 OK'});await assert.rejects(sendLoginCode('staff@example.test','123456'),error=>error.code==='GMAIL_SMTP_UNCONFIRMED'&&error.deliveryUncertain===true);}
 finally{f.restore();}
});

test('SMTP connection checks are Super Admin only and failed authentication leaves no usable login challenge',async()=>{
 const {default:express}=await import('express');
 const {default:admin}=await import('../src/routes/admin.js');
 const {default:login}=await import('../src/routes/login.js');
 const {authenticate}=await import('../src/middleware/auth.js');
 const {errorHandler}=await import('../src/middleware/error.js');
 const f=fixture();
 const previous={from:adminDb.from,rpc:adminDb.rpc,auth:adminDb.auth.getUser,log:console.error};
 let role='owner',issued=0,deleted=0;const logs=[];
 const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
 adminDb.auth.getUser=async()=>({data:{user:{id:uid,email:'staff@example.test'}}});
 adminDb.from=table=>table==='integration_settings'?previous.from(table):({select(){return this;},eq(){return this;},delete(){deleted++;return this;},single:async()=>({data:{id:uid,active:true,role}}),maybeSingle:async()=>({data:null,error:null}),then(resolve){return Promise.resolve({error:null}).then(resolve);}});
 adminDb.rpc=async name=>{assert.equal(name,'issue_email_challenge');issued++;return {error:null};};console.error=(...args)=>logs.push(args);
 const app=express();app.use(express.json());app.use('/auth',login);app.get('/private',authenticate,(_req,res)=>res.json({ok:true}));
 app.use('/admin',(req,_res,next)=>{req.user={id:uid,role};next();},admin);app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}`,token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({session_id:sid,amr:[{method:'password'}]})).toString('base64url')+'.fixture';
 const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 try{
  async function post(path){return nativeFetch(base+path,{method:'POST',headers,body:'{}'});}
  assert.equal((await post('/admin/integrations/gmail/test')).status,403);assert.equal(f.checks,0);
  role='super_admin';assert.equal((await post('/admin/integrations/gmail/test')).status,200);assert.equal(f.checks,1);assert.equal(f.deliveries.length,0);
  f.failSend(Object.assign(new Error('private '+password),{code:'EAUTH',command:'AUTH PLAIN',responseCode:535}));
  let response=await post('/auth/otp/request'),body=await response.json();assert.equal(response.status,503);assert.equal(body.code,'GMAIL_SMTP_AUTH_FAILED');assert.equal(issued,1);assert.equal(deleted,1);
  assert.equal((await nativeFetch(base+'/private',{headers})).status,428);assert(!JSON.stringify({logs,body}).includes(password));
  f.failSend(null);response=await post('/auth/otp/request');assert.equal(response.status,200);assert.equal((await response.json()).sent,true);assert.equal(issued,2);assert.equal(deleted,1);
  assert.equal((await nativeFetch(base+'/private',{headers})).status,428);
 }finally{await new Promise(resolve=>server.close(resolve));adminDb.from=previous.from;adminDb.rpc=previous.rpc;adminDb.auth.getUser=previous.auth;console.error=previous.log;f.restore();}
});
