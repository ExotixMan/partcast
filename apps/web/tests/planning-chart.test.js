import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planningChart} from '../src/lib/planning.js';

test('expected demand remains visible after projected inventory is depleted',()=>{
 const data=Array.from({length:7},(_,i)=>({forecast_date:`2026-11-${String(i+7).padStart(2,'0')}`,predicted_quantity:.4}));
 const planning={today:'2026-11-06',product:{current_stock:2},data,actualSales:[{occurred_on:'2026-11-05',quantity:3}]};
 const rows=planningChart(planning),future=rows.filter(r=>r.predicted_quantity!=null);
 assert.equal(rows.find(r=>r.date==='2026-11-05').actual_quantity,3);
 assert.equal(rows.find(r=>r.date==='2026-11-06').projected_stock,2);
 [1.6,1.2,.8,.4,0,0,0].forEach((expected,i)=>assert(Math.abs(future[i].projected_stock-expected)<1e-10));
 assert(future.every(r=>r.predicted_quantity===.4&&r.projected_stock>=0));
 const empty=planningChart({...planning,product:{current_stock:0}}).filter(r=>r.predicted_quantity!=null);
 assert(empty.every(r=>r.projected_stock===0&&r.predicted_quantity===.4));
});
