import {test} from 'node:test';
import assert from 'node:assert/strict';
import {suggestedQuantity,suggestedCost} from '../src/lib/restock.js';

test('cached large recommendations show the next small purchase and its cost while preserving period demand',()=>{
 const cached={status:'out_of_stock',predicted_quantity:11,recommended_quantity:11,estimated_unit_cost:100,estimated_order_cost:1100};
 assert.equal(suggestedQuantity(cached),2);assert.equal(suggestedCost(cached),200);
 assert.equal(suggestedCost({...cached,estimated_unit_cost:undefined}),200);
 assert.equal(cached.predicted_quantity,11);assert.equal(cached.recommended_quantity,11);
 for(const value of [NaN,Infinity,-10,0])assert.equal(suggestedQuantity({...cached,recommended_quantity:value}),1);
 assert.equal(suggestedQuantity({status:'ok',recommended_quantity:0}),0);
 assert.equal(suggestedQuantity({status:'forecast_reorder',recommended_quantity:0.2}),1);
 assert.equal(suggestedQuantity({status:'forecast_reorder',recommended_quantity:1.2}),2);
});
