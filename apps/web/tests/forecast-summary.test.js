import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stockSummary} from '../src/lib/forecastSummary.js';
test('small forecast shortfalls are not rounded into sufficient stock',()=>{
 const value=stockSummary(1.0001,1);
 assert.equal(value.shortage,.0001);assert.equal(value.sufficient,false);
});
test('stock coverage reports the share of demand available, with a maximum of 100 percent',()=>{
  const summary=stockSummary(32,45);
  assert.equal(summary.remaining,13);assert.equal(summary.sufficient,true);assert.equal(summary.coverage,100);
  assert.equal(stockSummary(32,25).shortage,7);assert.equal(stockSummary(32,25).sufficient,false);
  assert.equal(stockSummary(32,25).coverage,78.125);
  assert.equal(stockSummary(10,0).shortage,10);assert.equal(stockSummary(10,0).coverage,0);
  assert.equal(stockSummary(4.2,1.2).shortage,3);assert.equal(stockSummary(0,0).remaining,0);
  assert.equal(stockSummary(32,null),null);
  const bearing=stockSummary(37.19,2);
  assert.equal(bearing.coverage.toFixed(1),'5.4');assert.equal(bearing.shortage,35.19);
  assert.equal(bearing.remaining,0);assert.equal(bearing.sufficient,false);
});
test('zero expected demand has no coverage ratio and missing quantities cannot become zero forecasts',()=>{
  assert.equal(stockSummary(0,0).coverage,null);assert.equal(stockSummary(0,45).coverage,null);
  for(const value of [null,undefined,NaN,Infinity])assert.equal(stockSummary(value,2),null);
});
