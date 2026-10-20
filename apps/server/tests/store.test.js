import {test} from 'node:test';
import assert from 'node:assert/strict';
import {amount,batchSchema,supplierEmailSchema,reportDates,validateSaleMovement} from '../src/utils/storeValidation.js';
const id='33333333-3333-4333-8333-333333333333',op='44444444-4444-4444-8444-444444444444';
test('baskets reject invalid quantities, duplicate parts, missing credit names and overpayments',()=>{
 const b={client_operation_id:op,tx_type:'sale',lines:[{product_id:id,quantity:1,unit_price:100}],is_credit:true,customer_name:'Juan',paid_amount:20};
 assert.equal(batchSchema.parse(b).kind,'batch');
 for(const n of [NaN,Infinity,-1,1e12,0.001,true,false,null,'',' ',{},[]])assert.equal(amount.safeParse(n).success,false);
 for(const n of [0,0.29,123.99])assert.equal(amount.safeParse(n).success,true);
 assert.equal(batchSchema.safeParse({...b,lines:[{product_id:id,quantity:1e308,unit_price:1}]}).success,false);
 for(const patch of [{customer_name:''},{paid_amount:101},{tx_type:'stock_in'},{lines:[...b.lines,...b.lines]}])assert.equal(batchSchema.safeParse({...b,...patch}).success,false);
});
test('sales need a positive price; a delivery can retain zero purchase cost',()=>{
 const b={client_operation_id:op,tx_type:'sale',lines:[{product_id:id,quantity:1,unit_price:100}]};
 for(const unit_price of [0,null,undefined,'',-1,0.001])assert.equal(batchSchema.safeParse({...b,lines:[{...b.lines[0],unit_price}]}).success,false);
 assert.equal(batchSchema.safeParse({...b,lines:[{...b.lines[0],unit_price:0.01}]}).success,true);
 assert.equal(batchSchema.safeParse({...b,tx_type:'stock_in',lines:[{...b.lines[0],unit_price:0}]}).success,true);
});
test('every sale line must round to at least one cent and declared totals must match',()=>{
 const b={client_operation_id:op,tx_type:'sale',lines:[{product_id:id,quantity:0.01,unit_price:0.01}]};
 assert.equal(batchSchema.safeParse(b).success,false);
 assert.equal(batchSchema.safeParse({...b,lines:[...b.lines,{product_id:op,quantity:1,unit_price:10}]}).success,false);
 assert.equal(batchSchema.safeParse({...b,tx_type:'stock_in'}).success,true);
 assert.equal(batchSchema.safeParse({...b,lines:[{product_id:id,quantity:0.1,unit_price:0.15}]}).success,true);
 const check=patch=>{
  const issues=[];
  validateSaleMovement({tx_type:'sale',quantity:0.1,unit_price:0.15,...patch},{addIssue:issue=>issues.push(issue)});
  return issues;
 };
 assert.deepEqual(check({total_amount:0.02}),[]);
 assert.deepEqual(check({total_amount:null}),[]);
 assert.deepEqual(check({}),[]);
 assert.match(check({total_amount:0.01})[0].message,/must match/);
 assert.match(check({quantity:0.01,unit_price:0.01})[0].message,/at least ₱0.01/);
 assert.match(check({quantity:1000000,unit_price:1000000})[0].message,/too large/);
 assert.deepEqual(check({tx_type:'stock_in',unit_price:0,total_amount:0}),[]);
});
test('only a sale with a customer balance validates its due date',()=>{
 const b={client_operation_id:op,tx_type:'sale',lines:[{product_id:id,quantity:1,unit_price:10}],occurred_at:'2026-01-01T20:00:00Z',is_credit:false};
 for(const due_date of ['bad date','2020-01-01',{hidden:true}]){
  assert.equal(batchSchema.safeParse({...b,due_date}).success,true);
  assert.equal(batchSchema.safeParse({...b,tx_type:'stock_in',due_date}).success,true);
  assert.equal(batchSchema.safeParse({...b,is_credit:true,customer_name:'Juan',paid_amount:10,due_date}).success,true);
  assert.equal(batchSchema.safeParse({...b,is_credit:true,customer_name:'Juan',paid_amount:1,due_date}).success,false);
 }
 const credit={...b,is_credit:true,customer_name:'Juan',paid_amount:1};
 assert.equal(batchSchema.safeParse({...credit,due_date:'2026-01-01'}).success,false);
 assert.equal(batchSchema.safeParse({...credit,due_date:'2026-01-02'}).success,true);
 assert.equal(batchSchema.safeParse({...credit,due_date:null}).success,true);
});
test('calendar export dates are inclusive in Philippines time and validated',()=>{
 assert.deepEqual(reportDates({from:'2026-10-01',to:'2026-10-10'}),{from:'2026-10-01',to:'2026-10-10',start:'2026-09-30T16:00:00.000Z',end:'2026-10-10T16:00:00.000Z'});
 assert.throws(()=>reportDates({from:'2026-02-30'}));assert.throws(()=>reportDates({from:'2026-10-10',to:'2026-10-01'}));
});
test('email drafts require real quantities and block subject header injection',()=>{
 const d={subject:'Please order',message:'Please confirm these parts.',items:[{product_id:id,part_number:'BP-001',description:'Brake pad',quantity:2.5}]};
 assert.equal(supplierEmailSchema.parse(d).items[0].quantity,2.5);
 for(const patch of [{subject:'Hello\nBcc: victim@example.test'},{items:[]},{items:[{...d.items[0],quantity:0}]}])assert.equal(supplierEmailSchema.safeParse({...d,...patch}).success,false);
 const col={id:op,label:'Delivery date'};
 assert.equal(supplierEmailSchema.parse({...d,extra_columns:[col],items:[{...d.items[0],unit:'pcs',extra_values:{[op]:'Monday'}}]}).items[0].extra_values[op],'Monday');
 for(const columns of [[col,col],[{...col,label:'Quantity'}],Array.from({length:6},()=>col)])assert.equal(supplierEmailSchema.safeParse({...d,extra_columns:columns}).success,false);
 assert.equal(supplierEmailSchema.safeParse({...d,items:[{...d.items[0],extra_values:{[op]:'Unknown column'}}]}).success,false);
});

test('local and database assistant use the same terminology without confusing fluids and components',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {productTerms,normalizeQuestion}=await import('../src/utils/partTerms.js');
 assert.equal(await readFile(new URL('../src/utils/partTerms.js',import.meta.url),'utf8'),await readFile(new URL('../../web/src/lib/partTerms.js',import.meta.url),'utf8'));
 assert.ok(productTerms('Magkano radiator fluid?').includes('antifreeze'));
 assert.ok(!productTerms('Magkano radiator fluid?').includes('radiyador'));
 assert.match(normalizeQuestion('May BP-001 ba tayo?'),/bp-001/);
});
