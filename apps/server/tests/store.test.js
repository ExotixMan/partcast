import {test} from 'node:test';
import assert from 'node:assert/strict';
import {amount,batchSchema,supplierEmailSchema,reportDates} from '../src/utils/storeValidation.js';
const id='33333333-3333-4333-8333-333333333333',op='44444444-4444-4444-8444-444444444444';
test('baskets reject invalid quantities, duplicate parts, missing credit names and overpayments',()=>{
 const b={client_operation_id:op,tx_type:'sale',lines:[{product_id:id,quantity:1,unit_price:100}],is_credit:true,customer_name:'Juan',paid_amount:20};
 assert.equal(batchSchema.parse(b).kind,'batch');
 for(const n of [NaN,Infinity,-1,1e12,0.001,true,false,null,'',' ',{},[]])assert.equal(amount.safeParse(n).success,false);
 for(const n of [0,0.29,123.99])assert.equal(amount.safeParse(n).success,true);
 assert.equal(batchSchema.safeParse({...b,lines:[{product_id:id,quantity:1e308,unit_price:1}]}).success,false);
 for(const patch of [{customer_name:''},{paid_amount:101},{tx_type:'stock_in'},{lines:[...b.lines,...b.lines]}])assert.equal(batchSchema.safeParse({...b,...patch}).success,false);
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
