export function stockSummary(predicted,currentStock){
  const demand=Math.max(0,Number(predicted)||0),stock=Number(currentStock);
  if(currentStock==null||!Number.isFinite(stock))return null;
  const available=Math.max(0,stock),shortage=Number(Math.max(0,demand-available).toFixed(2));
  return {demand,stock:available,remaining:Number(Math.max(0,available-demand).toFixed(2)),shortage,
    sufficient:shortage===0,consumption:available>0?demand/available*100:demand>0?100:0};
}
