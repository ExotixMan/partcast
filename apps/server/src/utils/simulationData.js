// Strong dataset declarations, rather than product terms such as "synthetic oil".
const demoSheets = new Set(['CAPSTONE_SYNTHETIC_ALL', 'SIMULATED_DAILY', 'SIMULATED_DEMAND', 'DAILY_MODELED_HISTORY']);
export const isSimulationWorksheetName = name => demoSheets.has(String(name ?? '').trim().toUpperCase());
export function simulatedDemandError() {
  return Object.assign(new Error('This workbook contains simulated demand. Use the labelled forecasting demo on Plan ahead. Store training history was not changed.'), {
    status:422, safe:true, code:'SIMULATED_DEMAND'
  });
}
