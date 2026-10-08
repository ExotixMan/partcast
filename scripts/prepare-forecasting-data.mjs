#!/usr/bin/env node
// Reads through the same bounded, non-evaluating parser used by the application.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from '../apps/server/node_modules/exceljs/excel.js';
import { loadSpreadsheet } from '../apps/server/src/utils/spreadsheet.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
if (!args.includes('--sales') || !args.includes('--inventory') || !args.includes('--out')) {
  throw new Error('Usage: node scripts/prepare-forecasting-data.mjs --sales sales.xlsx --inventory inventory.xlsx --out DIRECTORY --as-of YYYY-MM-DD [--linked-quantity-is-sold]');
}
const out = path.resolve(option('--out'));
await mkdir(out, { recursive: true, mode: 0o700 });
const scalar = value => {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) return scalar(value.result ?? null);
    if (value.richText) return value.richText.map(x => x.text).join('');
    if ('text' in value) return value.text;
    return null;
  }
  return value ?? null;
};
const payload = { as_of: args.includes('--as-of') ? option('--as-of') : new Date().toISOString().slice(0, 10), linked_quantity_is_sold: args.includes('--linked-quantity-is-sold') };
for (const name of ['sales', 'inventory']) {
  const source = path.resolve(option(`--${name}`));
  const bytes = await readFile(source);
  const workbook = await loadSpreadsheet(bytes, source);
  payload[name] = {
    filename: path.basename(source), sha256: createHash('sha256').update(bytes).digest('hex'),
    sheets: workbook.worksheets.map(sheet => ({
      name: sheet.name,
      rows: Array.from({ length: sheet.rowCount }, (_, index) =>
        Array.from({ length: sheet.columnCount }, (_, col) => scalar(sheet.getRow(index + 1).getCell(col + 1).value)))
    }))
  };
}
const input = path.join(out, 'source-data.json');
await writeFile(input, JSON.stringify(payload), { mode: 0o600 });
const python = process.env.PYTHON_BIN || path.join(root, '.venv/bin/python');
const run = spawnSync(python, [path.join(root, 'ml/prepare_raw_data.py'), '--input', input, '--out', out], { encoding: 'utf8' });
if (run.status !== 0) throw new Error(run.stderr || 'Data preparation failed.');
const tables = JSON.parse(await readFile(path.join(out, 'tables.json'), 'utf8'));
for (const [filename, sheets] of Object.entries(tables)) {
  const book = new ExcelJS.Workbook();
  book.creator = 'PartCast';
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    for (const row of rows) sheet.addRow(row);
    if (rows.length) {
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length, column: rows[0].length } };
      sheet.columns.forEach((column, i) => { column.width = Math.min(55, Math.max(16, String(rows[0][i] || '').length + 3)); });
    }
  }
  await book.xlsx.writeFile(path.join(out, filename));
}
console.log(run.stdout.trim());
