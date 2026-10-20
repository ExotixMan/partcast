import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {literalSearchFilter,paginationQuery,searchText} from '../src/utils/search.js';
import {parseLiteralFilters} from './fixtures/postgrest.js';

test('literal inventory filters retain punctuation and cannot add PostgREST conditions or PostgreSQL regex operators',async()=>{
 const db=new PGlite();
 try{
 const terms=['ABS(TRC) RELAY','Piyesa para sa ñ','50% A_B * \\ O-ring','x"),stock_status.eq.out,or(description.neq.x','^$.*+?()[]{}|'];
 for(const term of terms){
  const filters=parseLiteralFilters(literalSearchFilter(['part_number','description'],[term]));
  assert.deepEqual(filters.map(filter=>filter.column),['part_number','description']);
  for(const filter of filters){
   const {rows}=await db.query('select $1::text ~* $3::text as literal, $2::text ~* $3::text as unrelated',['Before '+term+' after','an unrelated part without that complete description',filter.pattern]);
   assert.equal(rows[0].literal,true);assert.equal(rows[0].unrelated,false);
  }
 }
 const wildcard=parseLiteralFilters(literalSearchFilter(['description'],['50% A_B *']))[0];
 const {rows}=await db.query('select $1::text ~* $2::text as matches',['50 anything A0B anything',wildcard.pattern]);assert.equal(rows[0].matches,false);
 assert.throws(()=>literalSearchFilter(['description,active.eq.false'],['oil']));
 }finally{await db.close();}
});

test('paging requires bounded finite integers and searches reject control characters and oversized values',()=>{
 assert.deepEqual(paginationQuery.parse({}),{page:1,pageSize:25});
 assert.deepEqual(paginationQuery.parse({page:'500000',pageSize:'100'}),{page:500000,pageSize:100});
 for(const key of ['page','pageSize'])for(const value of ['Infinity','NaN','1.5','0','-1','',[],['2','3'],{}])assert.throws(()=>paginationQuery.parse({[key]:value}));
 assert.throws(()=>paginationQuery.parse({page:'500001'}));assert.throws(()=>paginationQuery.parse({pageSize:'101'}));
 for(const term of ['x\u0000y','x\ny','x'.repeat(121),['oil','filter']])assert.throws(()=>searchText.parse(term));
});
