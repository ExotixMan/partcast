export const forecastReliabilityPolicy = Object.freeze({max_wape_percent:20, minimum_test_periods:2});

const day = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value ? Date.parse(value) : null;
const quantity = value => typeof value==='number' && Number.isFinite(value) && value>=0;
const missing = reason => ({status:reason, test_periods:0, mae:null, rmse:null, wape_percent:null});

export function partReliability(metrics, horizonDays) {
  const validation=metrics?.horizon_validation;
  const results=new Map(), groups=new Map();
  const cutoff=day(metrics?.as_of_date);
  if(!Number.isInteger(horizonDays) || horizonDays<7 || horizonDays>90 ||
    cutoff==null || validation?.horizon_days!==horizonDays || !Array.isArray(validation.windows))return results;
  for(const row of validation.windows){
    if(typeof row?.product_id!=='string' || !row.product_id.trim())return new Map();
    const group=groups.get(row.product_id)||{rows:new Map(),invalid:false};
    groups.set(row.product_id,group);
    const origin=day(row.origin),start=day(row.start),end=day(row.end);
    if(origin==null || start==null || end==null || end>cutoff || start-origin!==86400000 ||
      end-start!==(horizonDays-1)*86400000 || !quantity(row.actual_recorded_units) || !quantity(row.predicted_units)){
      group.invalid=true;continue;
    }
    const key=`${row.start}|${row.end}`,previous=group.rows.get(key);
    if(previous && (previous.actual_recorded_units!==row.actual_recorded_units || previous.predicted_units!==row.predicted_units))group.invalid=true;
    else group.rows.set(key,row);
  }
  for(const [productId,group] of groups){
    const rows=[...group.rows.values()].sort((a,b)=>a.start.localeCompare(b.start));
    if(group.invalid || rows.some((row,index)=>index>0 && rows[index-1].end>=row.start)){
      results.set(productId,missing('invalid_tests'));continue;
    }
    let actual=0,absolute=0,squared=0;
    for(const row of rows){
      const error=row.predicted_units-row.actual_recorded_units;
      actual+=row.actual_recorded_units;absolute+=Math.abs(error);squared+=error*error;
    }
    if(!rows.length || ![actual,absolute,squared].every(Number.isFinite)){
      results.set(productId,missing('invalid_tests'));continue;
    }
    const wape=actual>0?absolute/actual*100:null;
    if(wape!=null && !Number.isFinite(wape)){
      results.set(productId,missing('invalid_tests'));continue;
    }
    const threshold=actual*forecastReliabilityPolicy.max_wape_percent/100;
    const withinLimit=absolute<=threshold+Number.EPSILON*Math.max(1,absolute,threshold);
    const status=rows.length<forecastReliabilityPolicy.minimum_test_periods?'insufficient_tests':
      wape==null?'no_test_demand':withinLimit?'lower_error':'needs_review';
    results.set(productId,{status,test_periods:rows.length,mae:absolute/rows.length,rmse:Math.sqrt(squared/rows.length),wape_percent:wape});
  }
  return results;
}

export const reliabilityForPart = (results,productId) => results.get(productId)||missing('insufficient_tests');
