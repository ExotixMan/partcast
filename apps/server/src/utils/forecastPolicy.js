export const MAX_PLANNING_DAYS=60;

export function validatePlanningHorizon(value=30){
 if(typeof value!=='number'||!Number.isInteger(value)||value<7||value>MAX_PLANNING_DAYS){
  throw Object.assign(new Error('Choose a planning period from 7 to 60 days.'),{status:422,safe:true,code:'FORECAST_HORIZON_INVALID'});
 }
 return value;
}
