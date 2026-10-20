import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('production startup fails closed for copied example security secrets',()=>{
 const result=spawnSync(process.execPath,['--input-type=module','-e',"await import('./src/config.js')"],{cwd:new URL('../',import.meta.url),encoding:'utf8',env:{...process.env,
  NODE_ENV:'production',SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',
  SETUP_SECRET:'generate-a-random-secret-at-least-16-characters',CRON_SECRET:'generate-a-different-random-secret-at-least-24-characters',IP_HASH_SECRET:'generate-another-random-secret-at-least-16-characters',INTEGRATION_ENCRYPTION_KEY:'generate-a-stable-random-secret-at-least-32-characters'}});
 assert.equal(result.status,1);
 for(const key of ['SETUP_SECRET','CRON_SECRET','IP_HASH_SECRET','INTEGRATION_ENCRYPTION_KEY'])assert(result.stderr.includes(key));
 assert(!result.stderr.includes('generate-a-random-secret'));
});
