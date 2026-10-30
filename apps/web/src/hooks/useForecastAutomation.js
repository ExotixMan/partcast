import {useEffect,useRef} from 'react';
import {api} from '../lib/api.js';
import {invalidateData} from '../lib/liveData.js';
import {useLiveQuery} from './useLiveQuery.js';

export default function useForecastAutomation(enabled=true){
 const query=useLiveQuery(async signal=>{
  if(!enabled)return null;
  const state=await api.get('/api/forecast/automation',{signal});
  if(!['queued','training','ready','waiting_history','error'].includes(state?.status))throw new Error('Automatic forecasting is not available. Ask the Super Admin to check setup.');
  return state;
 },[enabled],['forecast_refresh_state']);
 const completed=useRef(null);
 useEffect(()=>{
  const id=query.data?.last_run_id;
  if(id&&completed.current!==id){completed.current=id;invalidateData(['forecast_runs'],false);}
 },[query.data?.last_run_id]);
 const pending=['queued','training'].includes(query.data?.status);
 useEffect(()=>{
  if(!enabled)return;
  const timer=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)query.refresh();},pending?2000:15000);
  return()=>clearInterval(timer);
 },[enabled,pending,query.refresh]);
 return query;
}
