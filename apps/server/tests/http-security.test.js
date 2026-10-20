import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {applyHttpSecurity} from '../src/middleware/httpSecurity.js';

async function fixture(run,{limit=20}={}) {
 const app=express();
 applyHttpSecurity(app,{frontendOrigins:['https://store.example.test'],limit,windowMs:60000});
 app.use(express.json({limit:'1kb'}));
 app.all('/api/echo',(req,res)=>res.json({ok:true}));
 app.get('/setup/status',(req,res)=>res.json({needsSetup:false}));
 app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try {await run(`http://127.0.0.1:${server.address().port}`);}
 finally {await new Promise(resolve=>server.close(resolve));}
}

test('allowed origins receive security and no-store headers; untrusted origins are rejected before application routes',async()=>fixture(async base=>{
 const allowed=await fetch(base+'/api/echo',{headers:{Origin:'https://store.example.test'}});
 assert.equal(allowed.status,200);assert.equal(allowed.headers.get('access-control-allow-origin'),'https://store.example.test');
 assert.equal(allowed.headers.get('x-content-type-options'),'nosniff');assert.equal(allowed.headers.get('x-frame-options'),'SAMEORIGIN');assert.equal(allowed.headers.get('cache-control'),'no-store');assert.equal(allowed.headers.get('x-powered-by'),null);assert(allowed.headers.get('content-security-policy'));
 const denied=await fetch(base+'/api/echo',{method:'POST',headers:{Origin:'https://attacker.example.test','content-type':'application/json'},body:'{"value":"attack"}'});
 assert.equal(denied.status,403);assert.equal(denied.headers.get('access-control-allow-origin'),null);assert.match((await denied.json()).error,/not allowed/);assert.equal(denied.headers.get('cache-control'),'no-store');
 assert.equal((await fetch(base+'/setup/status')).headers.get('cache-control'),'no-store');
}));

test('rate-limited requests are rejected before malformed or oversized JSON is parsed',async()=>fixture(async base=>{
 assert.equal((await fetch(base+'/api/echo')).status,200);
 for(const body of ['{invalid',JSON.stringify({value:'x'.repeat(2000)})]){
  const result=await fetch(base+'/api/echo',{method:'POST',headers:{'content-type':'application/json'},body});
  assert.equal(result.status,429);assert.match((await result.json()).error,/Too many requests/);assert(result.headers.get('retry-after'));
 }
},{limit:1}));

test('unblocked malformed and oversized requests still use their validation failures',async()=>fixture(async base=>{
 let result=await fetch(base+'/api/echo',{method:'POST',headers:{'content-type':'application/json'},body:'{invalid'});assert.equal(result.status,400);
 result=await fetch(base+'/api/echo',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({value:'x'.repeat(2000)})});assert.equal(result.status,413);
}));
