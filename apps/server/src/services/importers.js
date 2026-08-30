import ExcelJS from 'exceljs';
import crypto from 'node:crypto';
import { adminDb } from '../supabase.js';
import { cleanText, excelDate, numberOr, fetchAll } from '../utils/helpers.js';

function cellValue(cell) {
  const v = cell?.value;
  if (v && typeof v === 'object') {
    if ('result' in v) return v.result;
    if ('text' in v) return v.text;
    if ('richText' in v) return v.richText.map(x => x.text).join('');
  }
  return v;
}

function headerMap(ws) {
  for (let r = 1; r <= Math.min(ws.rowCount, 30); r++) {
    const values = [];
    ws.getRow(r).eachCell({ includeEmpty: true }, (cell, c) => { values[c] = String(cellValue(cell) ?? '').trim().toLowerCase(); });
    const hasPart = values.some(v => v.includes('part number'));
    const hasDesc = values.some(v => v.includes('description'));
    const hasQty = values.some(v => v.includes('quantity'));
    if ((hasPart || hasDesc) && hasQty) {
      const map = {};
      values.forEach((v, c) => {
        if (!v) return;
        if (v.includes('part number')) map.partNumber = c;
        else if (v.includes('sub')) map.subNumber = c;
        else if (v.includes('description')) map.description = c;
        else if (v === 'brand') map.brand = c;
        else if (v.includes('quantity')) map.quantity = c;
        else if (v.includes('unit  cost') || v.includes('unit cost') || v.includes('u. cost')) map.unitCost = c;
        else if (v === 'price' || v.startsWith('price ')) map.price = c;
        else if (v.includes('reference')) map.reference = c;
        else if (v === 'date') map.date = c;
        else if (v.includes('supplier')) map.supplier = c;
        else if (v.includes('notes')) map.notes = c;
        else if (v === 'unit') map.unit = c;
        else if (v === 'location') map.location = c;
        else if (v === 'amount') map.amount = c;
      });
      return { row: r, map };
    }
  }
  return null;
}

async function upsertSupplier(name) {
  const clean = cleanText(name, 180);
  if (!clean) return null;
  const { data, error } = await adminDb.from('suppliers').upsert({ name: clean }, { onConflict: 'name' }).select('id,name').single();
  if (error) throw error;
  return data;
}

async function findOrCreateProduct(record) {
  const partNumber = cleanText(record.partNumber, 120);
  if (partNumber) {
    const { data } = await adminDb.from('products').select('*').ilike('part_number', partNumber).maybeSingle();
    if (data) return data;
  }
  const description = cleanText(record.description, 500);
  if (!description) return null;
  if (!partNumber) {
    let matchQuery = adminDb.from('products').select('*').ilike('description', description);
    const brand = cleanText(record.brand, 120);
    if (brand) matchQuery = matchQuery.ilike('brand', brand);
    const { data: existing } = await matchQuery.limit(1).maybeSingle();
    if (existing) return existing;
  }
  const { data, error } = await adminDb.from('products').insert({
    part_number: partNumber,
    sub_number: cleanText(record.subNumber, 120),
    description,
    brand: cleanText(record.brand, 120),
    unit: cleanText(record.unit, 40),
    location: cleanText(record.location, 80),
    unit_cost: numberOr(record.unitCost, 0),
    selling_price: numberOr(record.price, 0)
  }).select('*').single();
  if (error) {
    if (error.code === '23505' && partNumber) {
      const retry = await adminDb.from('products').select('*').ilike('part_number', partNumber).single();
      if (!retry.error) return retry.data;
    }
    throw error;
  }
  return data;
}

export async function importInventoryWorkbook(buffer, fileName, userId) {
  const fileSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const previous = await adminDb.from('import_batches').select('id,created_at').eq('import_type','inventory').eq('file_sha256',fileSha256).eq('status','completed').limit(1);
  if (previous.error) throw previous.error;
  if (previous.data?.length) { const error=new Error('This exact inventory workbook was already imported.'); error.status=409; throw error; }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const { data: batch, error: batchError } = await adminDb.from('import_batches').insert({
    file_name: fileName, file_sha256: fileSha256, import_type: 'inventory', created_by: userId
  }).select('*').single();
  if (batchError) throw batchError;

  let read = 0, imported = 0, skipped = 0;
  const warnings = [];
  try {
    for (const ws of wb.worksheets) {
      const header = headerMap(ws);
      if (!header) continue;
      const isSnapshot = ws.name.trim().toLowerCase() === 'inventory';
      for (let r = header.row + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const get = key => header.map[key] ? cellValue(row.getCell(header.map[key])) : null;
        const record = {
          partNumber: get('partNumber'), subNumber: get('subNumber'), description: get('description'),
          brand: get('brand'), quantity: get('quantity'), unitCost: get('unitCost'), price: get('price'),
          reference: get('reference'), date: get('date'), supplier: get('supplier'), notes: get('notes'),
          unit: get('unit'), location: get('location'), amount: get('amount')
        };
        if (!cleanText(record.description) && !cleanText(record.partNumber)) continue;
        read++;
        const qty = numberOr(record.quantity, 0);
        if (qty <= 0) { skipped++; continue; }

        const product = await findOrCreateProduct(record);
        if (!product) { skipped++; continue; }

        if (isSnapshot) {
          const { error } = await adminDb.from('products').update({
            current_stock: qty,
            sub_number: cleanText(record.subNumber, 120) ?? product.sub_number,
            brand: cleanText(record.brand, 120) ?? product.brand,
            unit: cleanText(record.unit, 40) ?? product.unit,
            location: cleanText(record.location, 80) ?? product.location,
            unit_cost: numberOr(record.unitCost, product.unit_cost || 0),
            selling_price: numberOr(record.price, product.selling_price || 0)
          }).eq('id', product.id);
          if (error) throw error;
          imported++;
        } else {
          const supplier = await upsertSupplier(record.supplier);
          if (supplier) {
            await adminDb.from('product_suppliers').upsert({
              product_id: product.id,
              supplier_id: supplier.id,
              latest_unit_cost: numberOr(record.unitCost, 0)
            }, { onConflict: 'product_id,supplier_id' });
          }
          const { error } = await adminDb.from('purchase_history').insert({
            product_id: product.id,
            supplier_id: supplier?.id || null,
            part_number: cleanText(record.partNumber, 120),
            description: cleanText(record.description, 500),
            brand: cleanText(record.brand, 120),
            quantity: qty,
            unit_cost: numberOr(record.unitCost, 0),
            amount: numberOr(record.amount, qty * numberOr(record.unitCost, 0)),
            reference_no: cleanText(record.reference, 180),
            purchase_date: excelDate(record.date),
            notes: cleanText(record.notes, 1000),
            import_batch_id: batch.id
          });
          if (error) throw error;
          imported++;
        }
      }
    }

    await adminDb.from('import_batches').update({
      status: 'completed', rows_read: read, rows_imported: imported, rows_skipped: skipped,
      warnings, completed_at: new Date().toISOString()
    }).eq('id', batch.id);
    return { batchId: batch.id, rowsRead: read, rowsImported: imported, rowsSkipped: skipped, warnings };
  } catch (error) {
    await adminDb.from('import_batches').update({ status: 'failed', warnings: [...warnings, error.message], completed_at: new Date().toISOString() }).eq('id', batch.id);
    throw error;
  }
}

function findLegacyHeader(ws) {
  for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
    const vals = ws.getRow(r).values.map(v => String(v ?? '').trim().toLowerCase());
    if (vals.some(v => v === 'ref #') && vals.some(v => v === 'customer name')) return r;
  }
  return null;
}

export async function importLegacySalesWorkbook(buffer, fileName, userId, useProxy = false) {
  const fileSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const previous = await adminDb.from('import_batches').select('id,created_at').eq('import_type','legacy_sales').eq('file_sha256',fileSha256).eq('status','completed').limit(1);
  if (previous.error) throw previous.error;
  if (previous.data?.length) { const error=new Error('This exact customer-reference workbook was already imported.'); error.status=409; throw error; }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const { data: batch, error: batchError } = await adminDb.from('import_batches').insert({
    file_name: fileName, file_sha256: fileSha256, import_type: 'legacy_sales', created_by: userId
  }).select('*').single();
  if (batchError) throw batchError;

  const products = await fetchAll(() => adminDb.from('products').select('id,part_number').not('part_number','is',null));
  const partLookup = products
    .filter(p => p.part_number && String(p.part_number).trim().length >= 4)
    .sort((a,b) => String(b.part_number).length - String(a.part_number).length);

  let read = 0, imported = 0, skipped = 0, proxies = 0;
  const warnings = [];
  try {
    for (const ws of wb.worksheets) {
      const headerRow = findLegacyHeader(ws);
      if (!headerRow) continue;
      for (let r = headerRow + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const ref = cleanText(cellValue(row.getCell(1)), 180);
        const date = excelDate(cellValue(row.getCell(2)));
        const customer = cleanText(cellValue(row.getCell(3)), 240);
        const amountRaw = cellValue(row.getCell(4));
        const items = cleanText(cellValue(row.getCell(5)), 1500);
        if (!ref && !date && !customer && !items) continue;
        if ((customer || '').toUpperCase() === 'CANCELLED') { skipped++; continue; }
        read++;
        const upperItems = (items || '').toUpperCase();
        const matched = partLookup.find(p => upperItems.includes(String(p.part_number).trim().toUpperCase())) || null;
        const { error } = await adminDb.from('legacy_sales').insert({
          reference_no: ref, sale_date: date, customer_name: customer,
          amount: numberOr(amountRaw, 0), raw_items: items,
          matched_product_id: matched?.id || null, import_batch_id: batch.id
        });
        if (error) throw error;
        imported++;
        if (useProxy && matched && date) {
          const { error: proxyError } = await adminDb.from('demand_observations').insert({
            product_id: matched.id, occurred_on: date, quantity: 1,
            source: 'legacy_transaction_proxy', source_reference: ref
          });
          if (!proxyError) proxies++;
        }
      }
    }
    if (!useProxy) warnings.push('Legacy sales were imported for reporting only because the source workbook does not provide reliable quantity-per-item data.');
    await adminDb.from('import_batches').update({
      status: 'completed', rows_read: read, rows_imported: imported, rows_skipped: skipped,
      warnings, completed_at: new Date().toISOString()
    }).eq('id', batch.id);
    return { batchId: batch.id, rowsRead: read, rowsImported: imported, rowsSkipped: skipped, proxyObservations: proxies, warnings };
  } catch (error) {
    await adminDb.from('import_batches').update({ status: 'failed', warnings: [...warnings, error.message], completed_at: new Date().toISOString() }).eq('id', batch.id);
    throw error;
  }
}
