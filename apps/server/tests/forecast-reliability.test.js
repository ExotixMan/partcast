import {test} from 'node:test';
import assert from 'node:assert/strict';
import {partReliability,reliabilityForPart,forecastReliabilityPolicy} from '../src/utils/forecastReliability.js';

function window(origin,actual,predicted,product_id='part',horizon=30){
 const add=days=>new Date(Date.parse(origin)+days*86400000).toISOString().slice(0,10);
 return {product_id,origin,start:add(1),end:add(horizon),actual_recorded_units:actual,predicted_units:predicted};
}
const assess=(windows,horizon_days=30)=>partReliability({as_of_date:'2026-11-06',horizon_validation:{horizon_days,windows}},horizon_days);
const good=()=>[window('2026-06-01',10,11),window('2026-07-01',10,12)];

test('each part is assessed separately using every historical error without changing full-run metrics',()=>{
 const windows=[...good(),window('2026-06-01',20,40,'weak'),window('2026-07-01',20,1,'weak')];
 const metrics={as_of_date:'2026-11-06',horizon_validation:{horizon_days:30,model:{wape_percent:67.1234},windows}};
 const before=JSON.stringify(metrics),result=partReliability(metrics,30);
 assert.equal(result.get('part').status,'lower_error');assert.equal(result.get('part').wape_percent,15);
 assert.equal(result.get('weak').status,'needs_review');assert.equal(result.get('weak').wape_percent,97.5);
 assert.equal(JSON.stringify(metrics),before);
});
test('the 20 percent boundary passes and a larger unrounded error does not',()=>{
 assert.deepEqual(forecastReliabilityPolicy,{max_wape_percent:20,minimum_test_periods:2});
 assert.equal(assess([window('2026-06-01',10,12),window('2026-07-01',10,12)]).get('part').status,'lower_error');
 assert.equal(assess([window('2026-06-01',10,12),window('2026-07-01',10,12.0001)]).get('part').status,'needs_review');
});
test('missing, single-period, zero-demand and wrong-horizon evidence cannot pass',()=>{
 assert.equal(reliabilityForPart(partReliability(null,30),'part').status,'insufficient_tests');
 assert.equal(assess(good().slice(0,1)).get('part').status,'insufficient_tests');
 const noDemand=assess([window('2026-06-01',0,0),window('2026-07-01',0,0)]).get('part');
 assert.equal(noDemand.status,'no_test_demand');assert.equal(noDemand.wape_percent,null);
 assert.equal(partReliability({horizon_validation:{horizon_days:14,windows:good()}},30).size,0);
});
test('identical repeated windows never create additional evidence and conflicts fail closed',()=>{
 const one=good()[0];assert.equal(assess([one,one]).get('part').test_periods,1);
 assert.equal(assess([one,{...one,predicted_units:99},good()[1]]).get('part').status,'invalid_tests');
});
test('overlapping periods and malformed date bounds cannot establish lower error',()=>{
 assert.equal(assess([good()[0],window('2026-06-10',10,10)]).get('part').status,'invalid_tests');
 for(const change of [{origin:'2026-02-30'},{start:'2026-06-01'},{end:'2026-07-02'}]){
  assert.equal(assess([{...good()[0],...change},good()[1]]).get('part').status,'invalid_tests');
 }
 assert.equal(assess([...good(),window('2026-11-01',10,10)]).get('part').status,'invalid_tests');
});
test('invalid quantities cannot be silently dropped to create a good score',()=>{
 for(const actual of [-1,NaN,Infinity,'10',null,true]){
  assert.equal(assess([...good(),{...window('2026-08-01',10,10),actual_recorded_units:actual}]).get('part').status,'invalid_tests');
 }
 assert.equal(assess([...good(),window('2026-08-01',1e308,0)]).get('part').status,'invalid_tests');
});
test('per-part WAPE sums absolute errors before dividing, so opposite misses never cancel',()=>{
 const result=assess([window('2026-06-01',10,15),window('2026-07-01',10,5)]).get('part');
 assert.equal(result.wape_percent,50);assert.equal(result.mae,5);assert.equal(result.rmse,5);assert.equal(result.status,'needs_review');
});
