import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
Object.assign(process.env,{NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters'});
const {adminDb}=await import('../src/supabase.js');
const {default:login}=await import('../src/routes/login.js');

test('email-code guessing is limited per verified password account despite changing forwarded addresses',async()=>{
 const previous={from:adminDb.from,getUser:adminDb.auth.getUser,rpc:adminDb.rpc};
 const user='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222';
 let checks=0;
 adminDb.auth.getUser=async()=>({data:{user:{id:user,email:'staff@example.test'}},error:null});
 adminDb.from=()=>({select(){return this;},eq(){return this;},single:async()=>({data:{id:user,active:true,role:'owner'}})});
 adminDb.rpc=async(name)=>{assert.equal(name,'verify_email_challenge');checks++;return {data:{verified:false,error:'The code is incorrect.'},error:null};};
 const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({session_id:session,amr:[{method:'password'}]})).toString('base64url')+'.fixture-signature';
 const app=express();app.set('trust proxy',1);app.use(express.json());app.use('/auth',login);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{
  for(let i=0;i<41;i++){
   const response=await fetch(`http://127.0.0.1:${server.address().port}/auth/otp/verify`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json','x-forwarded-for':`192.0.2.${i+1}`},body:'{"code":"000000"}'});
   assert.equal(response.status,i<40?422:429);
   if(i===40){assert.match((await response.json()).error,/Too many code attempts/);assert(response.headers.get('retry-after'));}
  }
  assert.equal(checks,40);
 }finally{adminDb.from=previous.from;adminDb.auth.getUser=previous.getUser;adminDb.rpc=previous.rpc;await new Promise(resolve=>server.close(resolve));}
});
