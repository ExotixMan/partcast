// The database owns the queue and lease. Processes and browser tabs cannot
// duplicate work, and committed sales remain pending through API restarts.
export function createForecastAutomation({db,train,pollMs=2000,setTimer=setTimeout,clearTimer=clearTimeout,logger=console}){
 let busy=false,stopped=true,timer,lastWarning=0;
 async function finish(token,outcome,result={}){
  const {data,error}=await db.rpc('finish_forecast_refresh',{p_token:token,p_outcome:outcome,p_result:result});
  if(error)throw error;
  if(!data)throw new Error('Forecast worker no longer owns the calculation.');
 }
 async function tick(){
  if(busy)return;
  busy=true;
  let job;
  try{
   const {data,error}=await db.rpc('claim_forecast_refresh');
   if(error)throw error;
   job=data?.[0];
   if(!job)return;
   const result=await train({runId:job.lock_token,horizonDays:job.horizon_days,actorId:null,publish:completion=>finish(job.lock_token,'completed',completion)});
   if(result.skipped)await finish(job.lock_token,'waiting_history');
  }catch(error){
   if(job)try{await finish(job.lock_token,'error');}catch{/* Expired workers must not release another worker's lease. */}
   if(Date.now()-lastWarning>60000){
    lastWarning=Date.now();
    logger.error('Automatic forecasting is waiting to retry.',{code:error.code||'FORECAST_WORKER_ERROR'});
   }
  }finally{busy=false;}
 }
 async function loop(){
  if(stopped)return;
  await tick();
  if(!stopped){timer=setTimer(loop,pollMs);timer?.unref?.();}
 }
 return {
  tick,
  start(){if(!stopped)return;stopped=false;void loop();},
  stop(){stopped=true;clearTimer(timer);},
  async request(horizonDays){
   const {error}=await db.rpc('request_forecast_refresh',{p_horizon:horizonDays??null});
   if(error)throw error;
   return {queued:true};
  },
  async status(){
   const {data,error}=await db.from('forecast_refresh_state').select('status,horizon_days,requested_version,processed_version,requested_at,next_attempt_at,completed_at,last_run_id,reason_code').eq('id',1).single();
   if(error)throw Object.assign(new Error(['42P01','PGRST205','PGRST116'].includes(error.code)?'Automatic forecasting needs database migration 0014_automatic_forecasts.sql. Ask the Super Admin to check setup.':'Automatic forecasting is temporarily unavailable. It will retry automatically.'),{status:503,safe:true});
   return data;
  }
 };
}
