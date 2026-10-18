import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters'});
const {localAnswer,tagalogStoreAnswer}=await import('../src/services/assistant.js');
const {normalizeQuestion,explainParts}=await import('../src/utils/partTerms.js');
const part={part_number:'90915-YZZD2',description:'OIL FILTER',recommended_quantity:2,predicted_quantity:11,current_stock:0,unit:'pcs',quantity:7,supplier_name:'Parts supplier',selling_price:250};
const context={metrics:{},reorders:[part],lowStock:[],matchingProducts:[part],matchingDemand:[part],fastMoving:[part],slowMoving:[part],demandLeaders:[part],searchTerm:'90915-YZZD2',demandEstimate:{available:true,horizonDays:30},sales:{today:{quantity:2,revenue:500},last7Days:{quantity:7,revenue:1750},last30Days:{quantity:15,revenue:3750}}};
test('restock replies separate exact part numbers and quantities without replacing forecast values',()=>{
 const restock=localAnswer('restock',context);
 assert.match(restock,/\n- OIL FILTER\n  Part no\. 90915-YZZD2\n  Order: \*\*2 pcs\*\*/);
 assert(!restock.includes(';'));
 const forecast=localAnswer('forecast 90915-YZZD2',context);
 assert.match(forecast,/May sell: \*\*11 pcs\*\*/);assert.match(forecast,/Next purchase: \*\*2 pcs\*\*/);
 assert.equal(part.predicted_quantity,11);assert.equal(part.recommended_quantity,2);
});
test('everyday Tagalog questions find restock and best sellers with plain quantities',()=>{
 const restock=tagalogStoreAnswer('Ano ang dapat orderin?',context);
 assert.match(restock,/Ito ang puwedeng orderin/);assert.match(restock,/Order: \*\*2 piraso\*\*/);
 const best=tagalogStoreAnswer('Ano ang mabenta?',context);assert.match(best,/Nabenta: \*\*7\*\*/);
 const slow=tagalogStoreAnswer('Ano ang hindi mabenta?',context);assert.match(slow,/Mas kaunti ang benta/);
 for(const reply of [restock,best,slow,tagalogStoreAnswer('forecast',context)])assert.doesNotMatch(reply,/\b(yunit|pagtataya|pangangailangan|imbentaryo|kasalukuyang)\b/i);
 assert.match(normalizeQuestion('Puwede bang i-order ang 90915-YZZD2?'),/restock/);
});
test('sales totals and car-part distinctions remain factual in short replies',()=>{
 assert.match(localAnswer('sales today',context),/₱500.00/);
 assert.match(tagalogStoreAnswer('benta ngayon',context),/500.00/);
 const definition=explainParts('Pareho ba ang coolant at radiator?',true);
 assert.match(definition,/magkaibang produkto/i);assert(definition.includes('\n\n'));
});
test('a short list of part details does not incorrectly claim there are no low-stock parts',()=>{
 const limited={...context,lowStock:[],metrics:{lowStock:17,outOfStock:3}};
 assert.match(tagalogStoreAnswer('Ano ang paubos na stock?',limited),/17/);
 assert.match(tagalogStoreAnswer('Ano ang ubos na stock?',limited),/3/);
});
