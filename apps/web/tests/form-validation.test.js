import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fieldProblem} from '../src/lib/formValidation.js';
const field=(patch={})=>({willValidate:true,type:'text',tagName:'INPUT',required:false,value:'valid',minLength:-1,validity:{valid:true},...patch});
test('required text rejects whitespace and trimmed short values without changing entries',()=>{
 const blank=field({required:true,value:'   '});assert.equal(fieldProblem(blank).key,'Enter a value.');assert.equal(blank.value,'   ');
 assert.equal(fieldProblem(field({required:true,minLength:2,value:' x '})).key,'Use at least {v0} characters.');
 assert.equal(fieldProblem(field({type:'password',required:true,minLength:10,value:'  long password  '})),null);
 assert.equal(fieldProblem(field({willValidate:false,required:true,value:''})),null);
});
test('forms identify email, numeric, range and decimal errors in everyday terms',()=>{
 assert.equal(fieldProblem(field({type:'email',validity:{valid:false,typeMismatch:true}})).key,'Enter a valid email address.');
 assert.deepEqual(fieldProblem(field({min:'0',validity:{valid:false,rangeUnderflow:true}})),{key:'Enter {v0} or more.',values:{v0:'0'}});
 assert.deepEqual(fieldProblem(field({max:'365',validity:{valid:false,rangeOverflow:true}})),{key:'Enter {v0} or less.',values:{v0:'365'}});
 assert.equal(fieldProblem(field({step:'1',validity:{valid:false,stepMismatch:true}})).key,'Use a whole number.');
 assert.equal(fieldProblem(field({step:'0.01',validity:{valid:false,stepMismatch:true}})).key,'Use a valid amount with up to 2 decimal places.');
});
