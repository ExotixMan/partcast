
const quantityHeaders = new Set([
  'demand quantity', 'demand qty', 'quantity sold', 'sales quantity',
  'units sold', 'qty sold', 'demand',
  'recorded qty', 'recorded quantity', 'actual qty', 'actual quantity'
]);

export const isDemandQuantityHeader = value => quantityHeaders.has(value);
