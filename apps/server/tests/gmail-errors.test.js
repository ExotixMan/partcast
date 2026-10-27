import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{PARTCAST_DEMO_MODE:'false',SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters',GMAIL_CLIENT_ID:'fixture-client-id',GMAIL_CLIENT_SECRET:'fixture-client-secret',GMAIL_REFRESH_TOKEN:'fixture-refresh-token',GMAIL_SENDER_EMAIL:'fixture@example.test'});
const {adminDb}=await import('../src/supabase.js');
const {config}=await import('../src/config.js');
const {clearIntegrationCache,encryptIntegration}=await import('../src/utils/integrations.js');
const {gmailAccessToken}=await import('../src/utils/gmail.js');
const {errorHandler}=await import('../src/middleware/error.js');

test('public Gmail diagnostics and their log details exclude unexpected provider fields and values',()=>{
 const marker='PRIVATE_PROVIDER_RESPONSE',logs=[];let body;const previous=console.error;
 const failure=Object.assign(new Error('SMTP connection failed.'),{status:503,safe:true,code:'GMAIL_SMTP_UNAVAILABLE',details:{
  provider:'gmail',stage:marker,settings_source:'api_environment',smtp_error_code:'ETIMEDOUT',smtp_command:'AUTH '+marker,smtp_response_code:535,http_status:999,google_error:marker,password:marker
 }});
 const response={headersSent:false,status(){return this;},json(value){body=value;return this;}};
 try{
  console.error=(...args)=>logs.push(args);errorHandler(failure,{},response,()=>{});
  assert.deepEqual(body.diagnostics,{provider:'gmail',settings_source:'api_environment',smtp_error_code:'ETIMEDOUT',smtp_response_code:535});
  assert(!JSON.stringify({body,logs}).includes(marker));
 }finally{console.error=previous;}
});

test('Google token failures identify the recovery action and active settings without exposing upstream data',async t=>{
 const original={from:adminDb.from,fetch:globalThis.fetch,refresh:config.GMAIL_REFRESH_TOKEN};
 let saved=false;
 const exposed='NEVER_EXPOSE_GOOGLE_RESPONSE_OR_CREDENTIALS';
 adminDb.from=table=>{assert.equal(table,'integration_settings');return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:saved?{enabled:true,encrypted_config:encryptIntegration({client_id:'saved-client',client_secret:'saved-secret',refresh_token:config.GMAIL_REFRESH_TOKEN,sender_email:'fixture@example.test'})}:null,error:null})};};
 const cases=[
  {label:'invalid OAuth client',status:401,error:'invalid_client',code:'GMAIL_OAUTH_INVALID_CLIENT',message:/client ID or client secret/},
  {label:'expired or revoked grant in saved settings',status:400,error:'invalid_grant',saved:true,code:'GMAIL_OAUTH_INVALID_GRANT',message:/refresh token expired/},
  {label:'unauthorized client',status:400,error:'unauthorized_client',code:'GMAIL_OAUTH_UNAUTHORIZED_CLIENT',message:/not authorized/},
  {label:'consent denied',status:403,error:'access_denied',code:'GMAIL_OAUTH_ACCESS_DENIED',message:/denied Gmail access/},
  {label:'invalid scope',status:400,error:'invalid_scope',code:'GMAIL_OAUTH_INVALID_SCOPE',message:/Gmail send permission/},
  {label:'successful token missing send scope',status:200,body:{access_token:exposed,scope:'openid'},code:'GMAIL_OAUTH_INVALID_SCOPE',message:/Gmail send permission/},
  {label:'Google rate limit is temporary',status:429,error:'invalid_grant',code:'GMAIL_OAUTH_UNAVAILABLE',message:/temporarily unavailable/},
  {label:'Google outage is temporary',status:503,error:'invalid_client',code:'GMAIL_OAUTH_UNAVAILABLE',message:/temporarily unavailable/},
  {label:'malformed success',status:200,body:null,code:'GMAIL_OAUTH_BAD_RESPONSE',message:/unexpected Gmail authorization/},
  {label:'HTML response',status:502,html:true,code:'GMAIL_OAUTH_UNAVAILABLE',message:/temporarily unavailable/},
  {label:'unknown errors are not reflected',status:400,error:exposed,code:'GMAIL_OAUTH_BAD_RESPONSE',message:/unexpected Gmail authorization/},
  {label:'network errors cannot leak request details',network:true,code:'GMAIL_OAUTH_UNAVAILABLE',message:/temporarily unavailable/}
 ];
 try{
  for(let i=0;i<cases.length;i++)await t.test(cases[i].label,async()=>{
   const c=cases[i];saved=Boolean(c.saved);config.GMAIL_REFRESH_TOKEN='case-specific-refresh-'+i;clearIntegrationCache();
   globalThis.fetch=async(url,options)=>{
    assert.equal(url,'https://oauth2.googleapis.com/token');assert.equal(new URLSearchParams(options.body).get('grant_type'),'refresh_token');
    if(c.network)throw new TypeError(exposed+' '+config.GMAIL_CLIENT_SECRET);
    return new Response(c.html?'<html>'+exposed+'</html>':JSON.stringify(Object.hasOwn(c,'body')?c.body:{error:c.error,error_description:exposed,client_secret:config.GMAIL_CLIENT_SECRET,refresh_token:config.GMAIL_REFRESH_TOKEN,access_token:exposed}),{status:c.status,headers:{'content-type':c.html?'text/html':'application/json'}});
   };
   let failure;try{await gmailAccessToken();}catch(error){failure=error;}
   assert(failure,'The failed connection must never produce an access token.');
   assert.equal(failure.code,c.code);assert.equal(failure.status,503);assert.equal(failure.safe,true);assert.match(failure.message,c.message);
   assert.equal(failure.details.settings_source,c.saved?'saved_partcast_settings':'api_environment');
   assert.equal(failure.details.google_error,c.status>=500||c.status===429||c.network||c.error===exposed||Object.hasOwn(c,'body')&&c.body===null?null:c.body?'invalid_scope':c.error);
   const logs=[];const oldLog=console.error;let json;
   try{console.error=(...args)=>logs.push(args);errorHandler(failure,{}, {headersSent:false,status(n){assert.equal(n,503);return this;},json(body){json=body;}},()=>assert.fail('Unexpected error forwarding'));}finally{console.error=oldLog;}
   assert.equal(json.code,c.code);assert.equal(json.details,undefined);assert.equal(json.hint,undefined);
   const output=JSON.stringify({json,logs,error:failure});
   for(const secret of [exposed,config.GMAIL_CLIENT_SECRET,config.GMAIL_REFRESH_TOKEN,'saved-secret'])assert(!output.includes(secret));
  });
 }finally{adminDb.from=original.from;globalThis.fetch=original.fetch;config.GMAIL_REFRESH_TOKEN=original.refresh;clearIntegrationCache();}
});

test('a rejected Gmail authorization removes the unsent login challenge; corrected credentials recover without bypassing OTP',async()=>{
 const {default:express}=await import('express');
 const {default:login}=await import('../src/routes/login.js');
 const {authenticate}=await import('../src/middleware/auth.js');
 const previous={from:adminDb.from,auth:adminDb.auth.getUser,rpc:adminDb.rpc,fetch:globalThis.fetch,refresh:config.GMAIL_REFRESH_TOKEN,log:console.error};
 const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
 let broken=true,mailCalls=0,issued=0,deleted=0,settings;
 const logs=[];
 adminDb.auth.getUser=async()=>({data:{user:{id:uid,email:'fixture@example.test'}}});
 adminDb.from=table=>({select(){return this;},eq(){return this;},delete(){assert.equal(table,'email_login_challenges');deleted++;return this;},
 single:async()=>({data:{id:uid,active:true,role:'owner'}}),maybeSingle:async()=>({data:null,error:null}),then(resolve){return Promise.resolve({error:null}).then(resolve);}});
 adminDb.rpc=async(name,args)=>{assert.equal(name,'issue_email_challenge');issued++;assert.equal(args.p_session,sid);return {error:null};};
 globalThis.fetch=async(url,options)=>{
  if(String(url).startsWith('http://127.0.0.1:'))return previous.fetch(url,options);
  if(url==='https://oauth2.googleapis.com/token'){
   settings=new URLSearchParams(options.body);
   return new Response(JSON.stringify(broken?{error:'invalid_client',error_description:'private-upstream-details'}:{access_token:'fixture-google-access',scope:'https://www.googleapis.com/auth/gmail.send',expires_in:3600}),{status:broken?401:200});
  }
  assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');mailCalls++;return new Response('{"id":"fixture-message"}',{status:200});
 };
 console.error=(...args)=>logs.push(args);config.GMAIL_REFRESH_TOKEN='http-test-refresh-initial';clearIntegrationCache();
 const app=express();app.use(express.json());app.use('/auth',login);app.get('/private',authenticate,(req,res)=>res.json({ok:true}));app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}`,token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({session_id:sid,amr:[{method:'password'}]})).toString('base64url')+'.fixture';
 const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 try{
  let response=await fetch(base+'/auth/otp/request',{method:'POST',headers,body:'{}'});let body=await response.json();
  assert.equal(response.status,503);assert.equal(body.code,'GMAIL_OAUTH_INVALID_CLIENT');assert.match(body.error,/client ID or client secret/);
  assert.equal(deleted,1);assert.equal(issued,1);assert.equal(mailCalls,0);assert.equal((await fetch(base+'/private',{headers})).status,428);
  assert.equal(logs[0][1].details.google_error,'invalid_client');assert.equal(logs[0][1].details.http_status,401);assert.equal(logs[0][1].details.settings_source,'api_environment');assert(!JSON.stringify(logs).includes('private-upstream-details'));
  broken=false;config.GMAIL_REFRESH_TOKEN='http-test-refresh-corrected';clearIntegrationCache();
  response=await fetch(base+'/auth/otp/request',{method:'POST',headers,body:'{}'});body=await response.json();assert.equal(response.status,200);assert.equal(body.sent,true);assert.equal(issued,2);assert.equal(deleted,1);assert.equal(mailCalls,1);assert.equal(settings.get('refresh_token'),'http-test-refresh-corrected');
  assert.equal((await fetch(base+'/private',{headers})).status,428);
 }finally{await new Promise(resolve=>server.close(resolve));adminDb.from=previous.from;adminDb.auth.getUser=previous.auth;adminDb.rpc=previous.rpc;globalThis.fetch=previous.fetch;config.GMAIL_REFRESH_TOKEN=previous.refresh;console.error=previous.log;clearIntegrationCache();}
});
