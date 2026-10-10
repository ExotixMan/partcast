import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canOpenPage,verifiedCacheMatches} from '../src/lib/access.js';
const id='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
const session=(s=sid,method='password')=>({user:{id},access_token:'header.'+Buffer.from(JSON.stringify({session_id:s,amr:[{method}]})).toString('base64url')+'.signature'});
test('offline access requires the same password session, verified account and unexpired email proof',()=>{
 const profile={id,active:true,session_id:sid,verification_expires_at:'2099-01-01T00:00:00Z'};
 assert(verifiedCacheMatches(session(),profile));
 for(const user of [{...profile,active:false},{...profile,id:sid},{...profile,verification_expires_at:'2020-01-01'}, {...profile,verification_expires_at:undefined}])assert.equal(verifiedCacheMatches(session(),user),false);
 assert.equal(verifiedCacheMatches(session(id),profile),false);assert.equal(verifiedCacheMatches(session(sid,'otp'),profile),false);
});
test('Cashier pages are limited and technical settings belong only to Super Admin',()=>{
 for(const path of ['/inventory','/counter','/account'])assert(canOpenPage('cashier',path));
 for(const path of ['/','/reports','/debts','/users','/settings','/it-settings','/forecast'])assert.equal(canOpenPage('cashier',path),false);
 for(const role of ['owner','admin','inventory_staff','cashier'])assert.equal(canOpenPage(role,'/it-settings'),false);
 assert(canOpenPage('super_admin','/it-settings'));assert(canOpenPage('owner','/settings'));
});
