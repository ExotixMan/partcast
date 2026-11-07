import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planningChart} from '../src/lib/planning.js';

test('the demand chart uses recorded sales and forecasts independently of stock balances',()=>{
 const planning={today:'2026-11-07',product:{current_stock:2},actualSales:[{occurred_on:'2026-11-07',quantity:1}],data:[{forecast_date:'2026-11-08',predicted_quantity:.4}]};
 const rows=planningChart(planning);
 assert.equal(rows.find(r=>r.date==='2026-11-07').actual_quantity,1);
 assert.equal(rows.find(r=>r.date==='2026-11-08').predicted_quantity,.4);
 assert(rows.every(r=>!Object.hasOwn(r,'projected_stock')));
 assert.deepEqual(planningChart({...planning,product:{current_stock:100}}),rows);
});
