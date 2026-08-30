import ExcelJS from 'exceljs';

const headerStyle = {
  font: { bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } },
  alignment: { vertical: 'middle', horizontal: 'center' }
};

function styleSheet(ws) {
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (ws.rowCount > 0) {
    ws.getRow(1).eachCell(cell => { cell.style = headerStyle; });
    ws.getRow(1).height = 24;
  }
  ws.columns.forEach(col => {
    let max = 10;
    col.eachCell({ includeEmpty: false }, cell => {
      max = Math.max(max, Math.min(42, String(cell.value ?? '').length + 2));
    });
    col.width = max;
  });
  ws.autoFilter = ws.rowCount > 1 ? { from: 'A1', to: ws.getRow(1).lastCell.address } : undefined;
}

function addRows(ws, rows, columns) {
  ws.columns = columns.map(c => ({ header: c.header, key: c.key }));
  rows.forEach(row => ws.addRow(row));
  styleSheet(ws);
}

export async function buildBackupWorkbook(data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PartCast';
  wb.created = new Date();

  addRows(wb.addWorksheet('Products'), data.products, [
    { header: 'Part Number', key: 'part_number' }, { header: 'Sub#', key: 'sub_number' },
    { header: 'Description', key: 'description' }, { header: 'Brand', key: 'brand' },
    { header: 'Quantity', key: 'current_stock' }, { header: 'Unit', key: 'unit' },
    { header: 'Location', key: 'location' }, { header: 'Minimum Stock', key: 'minimum_stock' },
    { header: 'Safety Stock', key: 'safety_stock' }, { header: 'Unit Cost', key: 'unit_cost' },
    { header: 'Selling Price', key: 'selling_price' }, { header: 'Active', key: 'active' }
  ]);

  addRows(wb.addWorksheet('Inventory Transactions'), data.transactions, [
    { header: 'Date', key: 'occurred_at' }, { header: 'Type', key: 'tx_type' },
    { header: 'Part Number', key: 'part_number' }, { header: 'Description', key: 'description' },
    { header: 'Quantity', key: 'quantity' }, { header: 'Unit Cost', key: 'unit_cost' },
    { header: 'Unit Price', key: 'unit_price' }, { header: 'Reference', key: 'reference_no' },
    { header: 'Supplier', key: 'supplier_name' }, { header: 'Customer', key: 'customer_name' },
    { header: 'Total Amount', key: 'total_amount' }, { header: 'Notes', key: 'notes' }
  ]);

  addRows(wb.addWorksheet('Suppliers'), data.suppliers, [
    { header: 'Supplier', key: 'name' }, { header: 'Contact Person', key: 'contact_person' },
    { header: 'Email', key: 'email' }, { header: 'Phone', key: 'phone' },
    { header: 'Address', key: 'address' }, { header: 'Active', key: 'active' }
  ]);

  addRows(wb.addWorksheet('Product Suppliers'), data.productSuppliers || [], [
    { header: 'Part Number', key: 'part_number' }, { header: 'Description', key: 'description' },
    { header: 'Supplier', key: 'supplier_name' }, { header: 'Supplier Email', key: 'supplier_email' },
    { header: 'Supplier Part Number', key: 'supplier_part_number' }, { header: 'Latest Unit Cost', key: 'latest_unit_cost' },
    { header: 'Lead Time Days', key: 'lead_time_days' }, { header: 'Primary', key: 'is_primary' },
    { header: 'Updated At', key: 'updated_at' }
  ]);

  addRows(wb.addWorksheet('Demand Observations'), data.demandObservations || [], [
    { header: 'Date', key: 'occurred_on' }, { header: 'Part Number', key: 'part_number' },
    { header: 'Description', key: 'description' }, { header: 'Quantity', key: 'quantity' },
    { header: 'Source', key: 'source' }, { header: 'Source Reference', key: 'source_reference' }
  ]);

  addRows(wb.addWorksheet('Forecast Runs'), data.forecastRuns || [], [
    { header: 'Run ID', key: 'id' }, { header: 'Status', key: 'status' }, { header: 'Model', key: 'model_name' },
    { header: 'Model Version', key: 'model_version' }, { header: 'Horizon Days', key: 'horizon_days' },
    { header: 'Included Proxy', key: 'include_proxy' }, { header: 'Training Rows', key: 'training_rows' },
    { header: 'Product Count', key: 'product_count' }, { header: 'Training Min Date', key: 'training_date_min' },
    { header: 'Training Max Date', key: 'training_date_max' }, { header: 'Metrics', key: 'metrics' },
    { header: 'Started At', key: 'started_at' }, { header: 'Completed At', key: 'completed_at' }
  ]);

  addRows(wb.addWorksheet('Forecasts'), data.forecasts, [
    { header: 'Forecast Date', key: 'forecast_date' }, { header: 'Part Number', key: 'part_number' },
    { header: 'Description', key: 'description' }, { header: 'Predicted Quantity', key: 'predicted_quantity' },
    { header: 'Run ID', key: 'run_id' }
  ]);

  addRows(wb.addWorksheet('Legacy Sales'), data.legacySales, [
    { header: 'Reference', key: 'reference_no' }, { header: 'Date', key: 'sale_date' },
    { header: 'Customer', key: 'customer_name' }, { header: 'Amount', key: 'amount' },
    { header: 'Items', key: 'raw_items' }
  ]);

  addRows(wb.addWorksheet('Purchase History'), data.purchaseHistory, [
    { header: 'Date', key: 'purchase_date' }, { header: 'Supplier', key: 'supplier_name' },
    { header: 'Part Number', key: 'part_number' }, { header: 'Description', key: 'description' },
    { header: 'Brand', key: 'brand' }, { header: 'Quantity', key: 'quantity' },
    { header: 'Unit Cost', key: 'unit_cost' }, { header: 'Amount', key: 'amount' },
    { header: 'Reference', key: 'reference_no' }, { header: 'Notes', key: 'notes' }
  ]);


  addRows(wb.addWorksheet('Import Batches'), data.importBatches || [], [
    { header: 'File', key: 'file_name' }, { header: 'File SHA-256', key: 'file_sha256' },
    { header: 'Import Type', key: 'import_type' }, { header: 'Status', key: 'status' },
    { header: 'Rows Read', key: 'rows_read' }, { header: 'Rows Imported', key: 'rows_imported' },
    { header: 'Rows Skipped', key: 'rows_skipped' }, { header: 'Warnings', key: 'warnings' },
    { header: 'Created At', key: 'created_at' }, { header: 'Completed At', key: 'completed_at' }
  ]);

  addRows(wb.addWorksheet('Staff Profiles'), data.profiles || [], [
    { header: 'User ID', key: 'id' }, { header: 'Full Name', key: 'full_name' },
    { header: 'Role', key: 'role' }, { header: 'Active', key: 'active' },
    { header: 'Created At', key: 'created_at' }, { header: 'Updated At', key: 'updated_at' }
  ]);

  addRows(wb.addWorksheet('System Settings'), data.settings || [], [
    { header: 'Key', key: 'key' }, { header: 'Value', key: 'value' },
    { header: 'Updated By', key: 'updated_by' }, { header: 'Updated At', key: 'updated_at' }
  ]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildReportWorkbook({ title, sheets }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PartCast';
  wb.title = title;
  wb.created = new Date();
  for (const sheet of sheets) addRows(wb.addWorksheet(sheet.name.slice(0, 31)), sheet.rows, sheet.columns);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
