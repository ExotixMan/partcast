import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {parseLiteralFilters} from './fixtures/postgrest.js';
Object.assign(process.env,{NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters'});
const {adminDb}=await import('../src/supabase.js');
const {default:router}=await import('../src/routes/api.js');
const {errorHandler}=await import('../src/middleware/error.js');
const {answerAssistant}=await import('../src/services/assistant.js');

test('product and movement lists reject invalid paging and filters before database reads and sort tied rows consistently',async()=>{
 const previous=adminDb.from,queries=[];
 adminDb.from=table=>{
  assert(['inventory_status','inventory_transactions'].includes(table));
  const query={table,filters:[],orders:[]};queries.push(query);
  return {select(){return this;},eq(column,value){query.filters.push([column,value]);return this;},or(value){query.logic=value;return this;},order(column,options){query.orders.push([column,options]);return this;},range:async(start,end)=>{query.range=[start,end];return {data:[],count:0,error:null};}};
 };
 const app=express();app.use((req,res,next)=>{req.user={role:'owner'};next();});app.use('/api',router);app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 try{
  for(const path of ['/products','/transactions']){
   for(const suffix of ['?page=Infinity','?page=NaN','?page=1.5','?page=500001','?page=0','?pageSize=0','?pageSize=101','?pageSize=1.1','?page=1&page=2'])assert.equal((await fetch(base+path+suffix)).status,400,path+suffix);
  }
  for(const suffix of ['?status=all,active.eq.false','?status=unknown','?q='+encodeURIComponent('x\u0000y'),'?q='+encodeURIComponent('x'.repeat(121))])assert.equal((await fetch(base+'/products'+suffix)).status,400);
  assert.equal((await fetch(base+'/transactions?type=unknown')).status,400);assert.equal(queries.length,0);
  const term='Piyesa (ñ) 50% A_B * \\ "),active.eq.false';
  let response=await fetch(base+'/products?'+new URLSearchParams({q:term,page:'2',pageSize:'1',status:'low',category:'parts'}));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{data:[],count:0,page:2,pageSize:1});
  let query=queries.at(-1);assert.deepEqual(query.filters,[['active',true],['category','parts'],['stock_status','low']]);assert.deepEqual(query.range,[1,1]);assert.deepEqual(query.orders.map(([column])=>column),['description','id']);
  const filters=parseLiteralFilters(query.logic);assert.deepEqual(filters.map(filter=>filter.column),['part_number','description','brand','barcode','alias_text']);
  for(const {pattern} of filters){assert(new RegExp(pattern,'iu').test(term));assert(!new RegExp(pattern,'iu').test('any other part'));}
  response=await fetch(base+'/transactions?'+new URLSearchParams({page:'500000',pageSize:'100',type:'sale'}));assert.equal(response.status,200);
  query=queries.at(-1);assert.deepEqual(query.filters,[['tx_type','sale']]);assert.deepEqual(query.range,[49999900,49999999]);assert.deepEqual(query.orders.map(([column])=>column),['occurred_at','id']);
 }finally{adminDb.from=previous;await new Promise(resolve=>server.close(resolve));}
});

test('cashier assistant searches real part descriptions with parentheses as literal text',async()=>{
 const previous=adminDb.from;let logic;
 adminDb.from=table=>{
  assert.equal(table,'inventory_status');
  return {select(){return this;},eq(){return this;},or(value){logic=value;return this;},order(){return this;},limit:async()=>({data:[{part_number:'88263-24030',description:'ABS(TRC) RELAY',current_stock:2,unit:'pcs',selling_price:250}],error:null})};
 };
 try{
  const result=await answerAssistant('Magkano ABS(TRC)?','fil','cashier');
  assert.match(result.answer,/ABS\(TRC\) RELAY/);assert.equal(result.mode,'database');
  const filters=parseLiteralFilters(logic);assert.deepEqual(filters.map(filter=>filter.column),['description','part_number','barcode','alias_text']);
  for(const {pattern} of filters){assert(new RegExp(pattern,'iu').test('ABS(TRC) RELAY'));assert(!new RegExp(pattern,'iu').test('ABS OTHER TRC RELAY'));}
 }finally{adminDb.from=previous;}
});
