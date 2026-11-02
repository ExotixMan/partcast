import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stockSummary} from '../src/lib/forecastSummary.js';
test('forecast summary calculates coverage and keeps zero stock finite',()=>{
  const summary=stockSummary(32,45);
  assert.equal(summary.remaining,13);assert.equal(summary.sufficient,true);assert.equal(summary.consumption.toFixed(1),'71.1');
  assert.equal(stockSummary(32,25).shortage,7);assert.equal(stockSummary(32,25).sufficient,false);
  assert.equal(stockSummary(10,0).shortage,10);assert.equal(Number.isFinite(stockSummary(10,0).consumption),true);
  assert.equal(stockSummary(4.2,1.2).shortage,3);assert.equal(stockSummary(0,0).remaining,0);
  assert.equal(stockSummary(32,null),null);
});
