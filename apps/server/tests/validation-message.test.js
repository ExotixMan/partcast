import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {z} from 'zod';
import {validationMessage} from '../src/utils/validationMessage.js';
import {errorHandler} from '../src/middleware/error.js';
test('validation messages name the field without database paths or input values',()=>{
 const schema=z.object({lead_time_days:z.number().int().min(0).max(365),email:z.email()});
 const issues=schema.safeParse({lead_time_days:366,email:'invalid-secret-value'}).error.issues;
 assert.equal(validationMessage(issues[0]),'Delivery time: Enter 365 or less.');
 assert.equal(validationMessage(issues[1]),'Email address: Enter a valid email address.');
 assert.doesNotMatch(validationMessage(issues[1]),/invalid-secret-value|email:|invalid_format/);
 assert.equal(validationMessage({path:['lines',0,'unit_price'],code:'custom',message:'Enter a selling price greater than zero.'}),'Price per unit: Enter a selling price greater than zero.');
 assert.equal(validationMessage(z.number().lt(100).safeParse(100).error.issues[0]),'This field: Enter less than 100.');
});
test('malformed JSON returns a safe error without reflecting request content',async()=>{
 const app=express();app.use(express.json());app.post('/form',(req,res)=>res.json({saved:true}));app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
 try{
  const response=await fetch(`http://127.0.0.1:${server.address().port}/form`,{method:'POST',headers:{'content-type':'application/json'},body:'{"password":"private-test-value",broken'});
  assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'The request could not be read. Please try again.'});
 }finally{await new Promise(resolve=>server.close(resolve));}
});
