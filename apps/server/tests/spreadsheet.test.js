import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {loadSpreadsheet} from '../src/utils/spreadsheet.js';
test('CSV preserves part numbers and quoted descriptions',async()=>{
 const w=await loadSpreadsheet(Buffer.from('Part Number,Description,Quantity\n00123,"Brake pad, front",5\n'),'parts.csv');
 assert.equal(w.worksheets[0].getCell('A2').value,'00123');
 assert.equal(w.worksheets[0].getCell('B2').value,'Brake pad, front');
});
test('workbooks preserve dates and cached formulas; reports still write with updated UUID',async()=>{
 const source=new ExcelJS.Workbook();const sheet=source.addWorksheet('Inventory');
 sheet.addRow(['Date','Part Number','Quantity']);sheet.addRow([new Date('2025-01-01T00:00:00Z'),'00123',{formula:'2+3',result:5}]);
 const w=await loadSpreadsheet(Buffer.from(await source.xlsx.writeBuffer()),'inventory.xlsx');
 assert.equal(w.worksheets[0].getCell('A2').value.toISOString(),'2025-01-01T00:00:00.000Z');
 assert.equal(w.worksheets[0].getCell('C2').value.result,5);
 assert.ok((await w.xlsx.writeBuffer()).length>100);
});
test('rejects malformed, unsupported and over-expanded uploads',async()=>{
 await assert.rejects(loadSpreadsheet(Buffer.from('broken'),'input.xlsx'),/Unable to read/);
 await assert.rejects(loadSpreadsheet(Buffer.from('x'),'input.exe'),/Use an/);
 const zip=new JSZip();zip.file('bomb.xml',Buffer.alloc(81*1024*1024));
 await assert.rejects(loadSpreadsheet(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),'input.xlsx'),/expanded workbook is too large/);
});
test('standard namespace prefixes and absolute relationship targets are normalized',async()=>{
 const w=new ExcelJS.Workbook();const s=w.addWorksheet('Inventory');s.addRow(['Part Number','Description']);s.addRow(['00123','Brake & disc']);
 const z=await JSZip.loadAsync(await w.xlsx.writeBuffer());
 for(const entry of Object.values(z.files)){
  if(entry.name==='xl/workbook.xml'||entry.name==='xl/worksheets/sheet1.xml'){
   let xml=await entry.async('string');xml=xml.replace('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"','xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"');
   xml=xml.replace(/<(\/?)([A-Za-z][\w-]*)(?=[\s/>])/g,'<$1x:$2');z.file(entry.name,xml);
  }
 }
 let rel=await z.file('xl/_rels/workbook.xml.rels').async('string');rel=rel.replace('Target="worksheets/sheet1.xml"','Target="/xl/worksheets/sheet1.xml"');z.file('xl/_rels/workbook.xml.rels',rel);
 const result=await loadSpreadsheet(await z.generateAsync({type:'nodebuffer'}),'inventory.xlsx');
 assert.equal(result.worksheets[0].getCell('A2').value,'00123');assert.equal(result.worksheets[0].getCell('B2').value,'Brake & disc');
});
