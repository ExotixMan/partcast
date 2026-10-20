import {useEffect,useState} from 'react';
import {api} from '../lib/api.js';


export default function useForecastReadiness(enabled,refreshKey) {
  const [report,setReport]=useState(null),[error,setError]=useState('');
  const [checking,setChecking]=useState(true),[slow,setSlow]=useState(false);
  useEffect(()=>{
    if(!enabled)return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(()=>{if(active)setSlow(true);},8000);
    setChecking(true);setSlow(false);setError('');setReport(null);
    api.get(`/api/forecast/readiness?includeProxy=${false}`,{signal:controller.signal}).then(result=>{
      const requirements=result?.requirements;
      if(typeof result?.ready!=='boolean'||!Array.isArray(result.products)||!requirements||
        !['sale_days','calendar_days','maximum_age_days'].every(key=>Number.isFinite(requirements[key])&&requirements[key]>0)||
        !Number.isInteger(result.record_count)||result.record_count<0||!Number.isInteger(result.current_part_count)||result.current_part_count<0||
        result.products.some(row=>!row||!Array.isArray(row.reasons)))
        throw new Error('The sales-history response was incomplete. Check again or ask your Super Admin to update the API.');
      if(active){setReport(result);}
    }).catch(error=>{if(active&&error.name!=='AbortError'){setReport(null);setError(error.code==='timeout'
      ? 'The sales-history check timed out. Try again. If this continues, ask the Super Admin to check the API logs.'
      : error.message);}})
      .finally(()=>{clearTimeout(timer);if(active)setChecking(false);});
    return ()=>{active=false;clearTimeout(timer);controller.abort();};
  },[enabled,refreshKey]);
  return {report,error,checking,slow};
}
