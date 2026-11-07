export function stockSummary(predicted,currentStock){
  const value=Number(predicted),stock=Number(currentStock);
  if(predicted==null||currentStock==null||!Number.isFinite(value)||!Number.isFinite(stock))return null;
  const demand=Math.max(0,value);
  const available=Math.max(0,stock),shortage=Number(Math.max(0,demand-available).toFixed(4));
  return {demand,stock:available,remaining:Number(Math.max(0,available-demand).toFixed(4)),shortage,
    sufficient:shortage===0,coverage:demand>0?Math.min(100,available/demand*100):null};
}
