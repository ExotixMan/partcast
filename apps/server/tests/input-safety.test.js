import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {validateJsonBody,uuidParam,settingsInteger} from '../src/middleware/validation.js';
import {cleanText} from '../src/utils/helpers.js';

test('spreadsheet text rejects database-invalid characters while preserving readable notes',()=>{
  assert.throws(()=>cleanText('Air\u0000filter'),error=>error.status===422&&error.safe===true);
  assert.equal(cleanText(' Shelf A\nSecond line '),'Shelf A\nSecond line');
  assert.equal(cleanText(null),null);assert.equal(cleanText('   '),null);
});

test('settings reject boolean, empty, array, object and fractional quantities',()=>{
  const schema=settingsInteger(1,365);
  for(const value of [true,false,null,undefined,'',' ',[],[1],{},'1.5',1.5,'1e2','0x10',Infinity,0,366])assert.equal(schema.safeParse(value).success,false,String(value));
  for(const value of [1,'1',365,' 365 '])assert.equal(schema.safeParse(value).success,true,String(value));
});
test('malformed ids and unsupported text are refused before application writes',async()=>{
  let writes=0;
  const app=express();app.use(express.json());app.use(validateJsonBody);app.param('id',uuidParam);
  app.post('/records/:id',(req,res)=>{writes++;res.json({saved:true});});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const url=`http://127.0.0.1:${server.address().port}/records/`,id='33333333-3333-4333-8333-333333333333';
  const post=(suffix,body)=>fetch(url+suffix,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  try{
    assert.equal((await post('bad-id',{name:'Part'})).status,400);
    for(const body of [{name:'part\u0000secret'},{nested:{note:'\u0007'}},{'bad\nkey':'value'}]){
      const result=await post(id,body);assert.equal(result.status,422);assert.doesNotMatch(JSON.stringify(await result.json()),/secret/);
    }
    let deep={};for(let i=0;i<22;i++)deep={nested:deep};assert.equal((await post(id,deep)).status,422);
    assert.equal((await post(id,{values:Array(10001).fill('a')})).status,422);assert.equal(writes,0);
    assert.equal((await post(id,{name:'Air filter',notes:'Shelf A\nSecond line\tstock'})).status,200);assert.equal(writes,1);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
