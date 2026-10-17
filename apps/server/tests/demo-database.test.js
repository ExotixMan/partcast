import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
Object.assign(process.env,{PARTCAST_DEMO_MODE:'true',SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters'});
const {createDataEnvironment}=await import('../src/services/dataEnvironment.js');
const {adminDb}=await import('../src/supabase.js');
const {authenticate}=await import('../src/middleware/auth.js');
const {default:router}=await import('../src/routes/api.js');
const {default:express}=await import('express');
const {errorHandler}=await import('../src/middleware/error.js');
const root=new URL('../../../',import.meta.url);
const seed=await readFile(new URL('downloads/demo-database/03_SEED_SIMULATED_DEMAND.sql',root),'utf8');
const first=await readFile(new URL('supabase/paste-ready/01_schema_and_roles.sql',root),'utf8');
const second=await readFile(new URL('supabase/paste-ready/02_login_and_permissions.sql',root),'utf8');
const user='11111111-1111-4111-8111-111111111111';
async function database(){
 const db=new PGlite({extensions:{pgcrypto}});
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key,bucket_id text);alter table storage.objects enable row level security;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;`);
 await db.exec(first);await db.exec(second);return db;
}
test('normal data mode excludes samples and demo mode requires the prepared database marker',async()=>{
 let called=0;
 const db={from(){called++;return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null,error:null})};}};
 assert.deepEqual((await createDataEnvironment({db,demoEnabled:false})()).sources,['actual_sale','imported_training_data']);assert.equal(called,0);
 await assert.rejects(createDataEnvironment({db,demoEnabled:true})(),/not a prepared demo project/);
});
test('SQL seeds PostgreSQL, reruns safely, and seeded observations run the normal authenticated XGBoost pipeline',async()=>{
 const db=await database(),old={from:adminDb.from,auth:adminDb.auth.getUser,storage:adminDb.storage.from};let server;
 try{
  await db.exec(seed);
  assert.equal(Number((await db.query('select count(*) n from products')).rows[0].n),9);
  assert.equal(Number((await db.query('select count(*) n from partcast_demo_daily')).rows[0].n),6570);
  assert.deepEqual((await db.query('select source,count(*)::int n from demand_observations group by source')).rows,[{source:'simulated_demo',n:778}]);
  const part=(await db.query('select id from products limit 1')).rows[0].id;
  await db.query("insert into demand_observations(product_id,occurred_on,quantity,source)values($1,current_date,999,'actual_sale')",[part]);
  await db.exec(seed);assert.equal(Number((await db.query("select count(*) n from demand_observations where source='actual_sale'")).rows[0].n),1);
  const observations=(await db.query("select d.product_id,d.occurred_on::text,quantity::float,source,json_build_object('part_number',p.part_number,'description',p.description,'unit',p.unit) product from demand_observations d join products p on p.id=d.product_id where source='simulated_demo' order by occurred_on,d.id")).rows;
  const marker=(await db.query("select value from system_settings where key='partcast_demo_environment'")).rows[0];
  const writes=[],filters=[],uploads=[];let validMarker=true;
  adminDb.auth.getUser=async()=>({data:{user:{id:user,email:'fixture@example.test'}}});
  adminDb.from=table=>{
   let inserted;
   return {select(){return this;},eq(){return this;},order(){return this;},
    in(key,values){filters.push(values);return this;},range:async()=>({data:observations,error:null}),
    single:async()=>({data:table==='profiles'?{id:user,active:true,role:'owner'}:inserted,error:null}),
    maybeSingle:async()=>({data:table==='system_settings'?(validMarker?marker:null):{expires_at:'2099-01-01T00:00:00Z'},error:null}),
    insert(value){inserted=value;writes.push({table,value});return this;},update(value){writes.push({table,value});return this;},
    then(resolve,reject){return Promise.resolve({data:null,count:778,error:null}).then(resolve,reject);}};
  };
  adminDb.storage.from=()=>({upload:async(path,buffer)=>{assert(JSON.parse(buffer.toString()).learner);uploads.push(path);return {error:null};}});
  const app=express();app.use(express.json());app.use('/api',authenticate,router);app.use(errorHandler);server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/api`,token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({session_id:user,amr:[{method:'password'}]})).toString('base64url')+'.test-only';
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  assert.equal((await fetch(base+'/me')).status,401);
  assert.equal((await(await fetch(base+'/me',{headers})).json()).user.data_environment,'simulated_demo');
  validMarker=false;assert.equal((await fetch(base+'/forecast/readiness',{headers})).status,503);validMarker=true;
  const quality=await(await fetch(base+'/data-quality',{headers})).json();assert.equal(quality.demoDemandRows,778);assert.equal(quality.actualDemandRows,0);
  const sales=await(await fetch(base+'/forecast/recorded-sales',{headers})).json();assert.equal(sales.mode,'simulated_demo');assert.equal(sales.record_count,778);assert(sales.data.every(row=>row.demo_records>0&&row.actual_records===0));
  const readiness=await(await fetch(base+'/forecast/readiness',{headers})).json();assert.equal(readiness.ready,true);assert.equal(readiness.current_part_count,9);
  const response=await fetch(base+'/forecast/train',{method:'POST',headers,body:JSON.stringify({horizonDays:30})});const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.forecastCount,270);assert.equal(result.metrics.data_mode,'simulated_demo');assert.equal(result.metrics.production_accuracy_established,false);assert.equal(result.metrics.source_counts.actual_sale,undefined);assert.equal(uploads.length,1);
  const run=writes.find(w=>w.table==='forecast_runs'&&w.value.status==='completed');assert.equal(run.value.metrics.source_counts.simulated_demo,778);assert(Number.isFinite(run.value.metrics.horizon_validation.model.wape_percent));
  assert.equal(writes.filter(w=>w.table==='demand_forecasts').flatMap(w=>w.value).length,270);assert(filters.every(s=>s.length===1&&s[0]==='simulated_demo'));
  assert(Number((await db.query('select count(*) n from reorder_recommendations where recommended_quantity>0')).rows[0].n)>0);
  await db.exec('set role authenticated;');await assert.rejects(db.query('select * from partcast_demo_daily'),/permission denied/);await db.exec('reset role;');
 }finally{adminDb.from=old.from;adminDb.auth.getUser=old.auth;adminDb.storage.from=old.storage;if(server)await new Promise(resolve=>server.close(resolve));await db.close();}
});
test('SQL refuses an existing store before adding the demo marker or changing its records',async()=>{
 const db=await database();try{
  await db.exec("insert into products(description,current_stock)values('Existing real part',7)");
  await assert.rejects(db.exec(seed),/Refusing to seed a store/);await db.exec('rollback;');
  assert.equal(Number((await db.query('select current_stock from products')).rows[0].current_stock),7);
  assert.equal((await db.query("select * from system_settings where key='partcast_demo_environment'")).rows.length,0);
  assert.equal((await db.query('select * from demand_observations')).rows.length,0);
 }finally{await db.close();}
});
