import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('a stalled runtime probe reports a startup timeout without trying more interpreters or claiming missing packages',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'partcast-test-runtime-'));
 const interpreter=path.join(directory,'fixture-interpreter');
 await writeFile(interpreter,'#!/usr/bin/env node\nsetInterval(()=>{},60000);\n',{mode:0o700});
 Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters',PYTHON_BIN:interpreter,ML_SCRIPT_PATH:'../../ml/train_forecast.py'});
 const {resolveForecastRuntime}=await import('../src/utils/ml.js');
 t.mock.timers.enable({apis:['setTimeout']});
 try {
  const result=resolveForecastRuntime();
  const rejected=assert.rejects(result,error=>{
   assert.equal(error.status,503);assert.equal(error.code,'FORECAST_RUNTIME_TIMEOUT');
   assert.match(error.message,/too long to start/);assert.doesNotMatch(error.message,/not installed/);
   return true;
  });
  t.mock.timers.tick(30001);
  await rejected;
 }finally{t.mock.timers.reset();await rm(directory,{recursive:true,force:true});}
});
