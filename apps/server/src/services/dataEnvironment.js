import {config} from '../config.js';
import {adminDb} from '../supabase.js';

export const actualDemandSources=['actual_sale','imported_training_data'];
export const simulatedDemandSource='simulated_demo';
export function createDataEnvironment({db,demoEnabled}) {
  return async function loadDataEnvironment() {
    if(!demoEnabled)return {mode:'actual',sources:actualDemandSources};
    const {data,error}=await db.from('system_settings').select('value').eq('key','partcast_demo_environment').maybeSingle();
    if(error)throw error;
    if(data?.value?.mode!=='simulated_demo'||data.value.seed_version!=='partcast-demo-v1')
      throw Object.assign(new Error('This API has demo mode enabled, but its database is not a prepared demo project. Run the labelled demo seed in the separate demo database.'),{status:503,safe:true});
    return {mode:'simulated_demo',sources:[simulatedDemandSource],historyDays:Number(data.value.history_days)||730};
  };
}
export const getDataEnvironment=createDataEnvironment({db:adminDb,demoEnabled:config.PARTCAST_DEMO_MODE});
export const markForecastMetrics=(metrics,environment)=>environment.mode==='simulated_demo'
  ? {...metrics,data_mode:'simulated_demo',production_accuracy_established:false,coverage_warning:'Generated sample demand does not establish actual-store forecast accuracy.',dataset_label:'Generated demand in a separate demo database'} : metrics;
