import {test} from 'node:test';
import assert from 'node:assert/strict';
import {forecastData} from '../src/utils/forecastData.js';

const part='33333333-3333-4333-8333-333333333333';
const row=(source,source_reference,quantity=2)=>({product_id:part,occurred_on:'2026-11-01',quantity,source,source_reference});
test('production forecasting excludes relabelled generated rows and retains owner-identified worksheet imports and counter sales',()=>{
 const counter=row('actual_sale','sale:transaction');
 const verified=row('imported_training_data','training:batch:Daily_B_Usable:PART-001:2026-11-01');
 const input=[counter,verified,row('imported_training_data',`training:${part}:2026-11-01`),row('imported_training_data',`SIMULATED:${part}:2026-11-01`),row('simulated_demo','generated'),row('imported_training_data','workbook:synthetic_training')];
 const result=forecastData(input);
 assert.deepEqual(result.observations,[counter,verified]);assert.equal(result.quality.excluded_generated_rows,4);assert.equal(result.quality.included_rows,2);
 assert.deepEqual(input[1],verified);
});
test('reference duplicates cannot double count while distinct same-day customer sales remain separate',()=>{
 const a=row('actual_sale','sale:a'),b=row('actual_sale','sale:b');
 const result=forecastData([a,{...a},b,row('actual_sale',null),row('actual_sale',null)]);
 assert.equal(result.observations.length,4);assert.equal(result.quality.duplicate_reference_rows,1);
 assert.throws(()=>forecastData([a,{...a,quantity:7}]),error=>error.status===422&&/Conflicting quantities/.test(error.message));
});
test('the isolated simulated environment can still read clearly labelled generated observations',()=>{
 const input=[row('simulated_demo','SIMULATED:example')];
 assert.deepEqual(forecastData(input,'simulated_demo').observations,input);
});
