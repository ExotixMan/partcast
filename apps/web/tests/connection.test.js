import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiConnection, supabaseConnectionIssue, connectionMessage } from '../src/lib/connection.js';
const jwt = claims => `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.test-signature`;

test('hosted sites reject local, insecure and missing API addresses', () => {
  const website = 'https://partcast-web.onrender.com';
  assert.match(resolveApiConnection('http://localhost:10000', website, true).error, /another device/);
  assert.match(resolveApiConnection('http://api.example.test', website, true).error, /HTTPS/);
  assert.match(resolveApiConnection(undefined, website, true).error, /has not been set/);
  assert.equal(resolveApiConnection('https://partcast-api.onrender.com/', website, true).url, 'https://partcast-api.onrender.com');
  assert.match(resolveApiConnection('https://partcast.onrender.com/health', website, true).error, /base server address/);
  assert.equal(resolveApiConnection('/', website, true).url, '');
  assert.equal(resolveApiConnection('http://localhost:10000', 'http://localhost:5173', false).url, 'http://localhost:10000');
});
test('frontend keys must be public and match the project URL', () => {
  const url = 'https://right-project.supabase.co';
  assert.equal(supabaseConnectionIssue(url, jwt({ref:'right-project',role:'anon'})), null);
  assert.match(supabaseConnectionIssue(url, jwt({ref:'wrong-project',role:'anon'})), /different stores/);
  assert.match(supabaseConnectionIssue(url, jwt({ref:'right-project',role:'service_role'})), /public/);
  assert.match(supabaseConnectionIssue(url, 'sb_secret_test'), /public/);
  assert.equal(supabaseConnectionIssue(url, 'sb_publishable_test'), null);
  assert.match(supabaseConnectionIssue('not a URL', 'key'), /invalid/);
});
test('network failures and timeouts differ from incorrect-password errors', () => {
  assert.match(connectionMessage(new TypeError('Failed to fetch')), /Cannot reach the store server/);
  assert.match(connectionMessage({name:'AuthRetryableFetchError',message:'Failed to fetch'},'sign-in service'), /Cannot reach the sign-in service/);
  assert.match(connectionMessage({name:'TimeoutError'}), /taking too long/);
  assert.equal(connectionMessage(new Error('Invalid login credentials')), 'Invalid login credentials');
});
