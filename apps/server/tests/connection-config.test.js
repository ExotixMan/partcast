import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supabaseKeyIssue, frontendOrigins, secretConfigurationIssue } from '../src/utils/connection-config.js';
const jwt = claims => `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.test-signature`;

test('server rejects keys for another project or the wrong role', () => {
  const url = 'https://right-project.supabase.co';
  assert.equal(supabaseKeyIssue(url, jwt({ref:'right-project',role:'service_role'}), 'service_role'), null);
  assert.match(supabaseKeyIssue(url, jwt({ref:'wrong-project',role:'service_role'}), 'service_role'), /another Supabase project/);
  assert.match(supabaseKeyIssue(url, jwt({ref:'right-project',role:'anon'}), 'service_role'), /service role/);
  assert.equal(supabaseKeyIssue(url, 'sb_secret_test', 'service_role'), null);
});
test('CORS origins normalize pasted website URLs without accepting wildcards', () => {
  assert.deepEqual(frontendOrigins('https://partcast-web.onrender.com/, https://partcast-web.onrender.com'), ['https://partcast-web.onrender.com']);
  assert.throws(() => frontendOrigins('*'));
  assert.throws(() => frontendOrigins('https://username:password@site.example.test'));
});

test('instructional secret placeholders are rejected without reflecting their values',()=>{
 for(const value of ['generate-a-random-secret-at-least-16-characters','generate-a-stable-random-secret-at-least-32-characters','REPLACE_WITH_SETUP_SECRET','YOUR_SECRET']){
  const issue=secretConfigurationIssue(value);assert.match(issue,/privately generated random secret/);assert(!issue.includes(value));
 }
 assert.equal(secretConfigurationIssue('a9c3e7f1082d64b59e7c1f3a8046d2c5'),null);assert.equal(secretConfigurationIssue(undefined),null);
});
