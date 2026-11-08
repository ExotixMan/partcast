import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planningChart} from '../src/lib/planning.js';

const planning={today:'2026-11-07',product:{current_stock:2},actualSales:[{occurred_on:'2026-11-07',quantity:3}],data:Array.from({length:7},(_,i)=>({forecast_date:`2026-11-${String(i+8).padStart(2,'0')}`,predicted_quantity:.4}))};

test('stock starts from the current balance, reaches zero and does not cap the demand forecast',()=>{
 const rows=planningChart(planning),future=rows.filter(row=>row.predicted_quantity!=null);
 const today=rows.find(row=>row.date===planning.today);
 assert.equal(today.actual_quantity,3);assert.equal(today.projected_stock,2);
 assert.equal(rows[0].projected_stock,null);
 assert.deepEqual(future.map(row=>row.projected_stock),[1.6,1.2,.8,.4,0,0,0]);
 assert(future.every(row=>row.predicted_quantity===.4));
 const empty=planningChart({...planning,product:{current_stock:0}}).filter(row=>row.predicted_quantity!=null);
 assert(empty.every(row=>row.projected_stock===0&&row.predicted_quantity===.4));
});

test('a changed balance updates projected stock while sales and forecast values stay the same',()=>{
 const before=planningChart(planning),after=planningChart({...planning,product:{current_stock:5}});
 assert.equal(before.at(-1).projected_stock,0);assert.equal(after.at(-1).projected_stock,2.2);
 const demandOnly=rows=>rows.map(({projected_stock,...row})=>row);
 assert.deepEqual(demandOnly(after),demandOnly(before));
});

test('projection orders future dates and excludes past predictions already reflected in current stock',()=>{
 const data=[{forecast_date:'2026-11-09',predicted_quantity:.8},{forecast_date:'2026-11-06',predicted_quantity:100},{forecast_date:'2026-11-08',predicted_quantity:.4}];
 const original=structuredClone(data);
 const future=planningChart({...planning,data}).filter(row=>row.predicted_quantity!=null);
 assert.deepEqual(future.map(row=>[row.date,row.projected_stock]),[['2026-11-08',1.6],['2026-11-09',.8]]);
 assert.deepEqual(data,original);
});

test('rounding removes floating-point residue when forecast demand consumes the whole balance',()=>{
 const data=Array.from({length:10},(_,i)=>({forecast_date:`2026-11-${String(i+8).padStart(2,'0')}`,predicted_quantity:.1}));
 assert.equal(planningChart({...planning,product:{current_stock:1},data}).at(-1).projected_stock,0);
});

test('an unavailable stock balance does not become a zero-stock projection',()=>{
 for(const stock of [null,undefined,'','not a number',-1]){
  const rows=planningChart({...planning,product:{current_stock:stock}});
  assert(rows.every(row=>row.projected_stock===null));
  assert.equal(rows.at(-1).predicted_quantity,.4);
 }
});
