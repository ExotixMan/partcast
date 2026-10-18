import {test} from 'node:test';
import assert from 'node:assert/strict';
import {suggestedQuantity,suggestedCost,filterRestock,matchesSearch} from '../src/lib/restock.js';

test('restock search combines part, name, supplier and stock filters without changing order quantities',()=>{
 const rows=[{product_id:'1',part_number:'90915-YZZD2',description:'Oil filter',supplier_name:'North Parts',supplier_id:'a',status:'low_stock',recommended_quantity:2},
 {product_id:'2',part_number:'ABC-02',description:'Engine oil',supplier_name:'South Parts',supplier_id:'b',status:'out_of_stock',recommended_quantity:1},
 {product_id:'3',part_number:'ABC-03',description:'Brake pad',supplier_id:null,status:'forecast_reorder',recommended_quantity:2}];
 assert.equal(filterRestock(rows,{query:' north OIL '})[0].product_id,'1');assert.equal(filterRestock(rows,{query:'yzzd2'})[0].product_id,'1');
 assert.equal(filterRestock(rows,{status:'out_of_stock',supplier:'b'}).length,1);
 assert.equal(filterRestock(rows,{supplier:'unassigned'})[0].product_id,'3');
 assert.equal(filterRestock(rows,{query:'oil',supplier:'unassigned'}).length,0);
 assert.equal(matchesSearch(['Supplier José','email@example.test'],'JOSE'),true);
 assert.equal(rows[0].recommended_quantity,2);assert.equal(filterRestock(rows).length,3);
});

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
