import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { Readable } from 'node:stream';
import path from 'node:path';
import { SaxesParser } from 'saxes';

const MAIN_NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const xmlEscape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;');
// ExcelJS expects unprefixed OOXML element names. Some valid producers use x:.
// Parse namespaces before normalizing, rather than applying replacements to data.
export function normalizeSpreadsheetXml(xml,relationshipsBase=null){
  const parser=new SaxesParser({xmlns:true});
  let output='',depth=0;
  parser.on('opentag',tag=>{
    const name=tag.uri===MAIN_NS?tag.local:tag.name;
    let attrs=Object.values(tag.attributes).filter(a=>!(a.prefix==='xmlns'&&a.value===MAIN_NS));
    if(relationshipsBase!==null&&tag.local==='Relationship'&&!attrs.some(a=>a.name==='TargetMode'&&a.value==='External'))attrs=attrs.map(a=>a.name==='Target'&&a.value.startsWith('/')?{...a,value:path.posix.relative(relationshipsBase,a.value.slice(1))}:a);
    if(depth===0&&tag.uri===MAIN_NS&&!attrs.some(a=>a.name==='xmlns'))attrs.push({name:'xmlns',value:MAIN_NS});
    output+='<'+name+attrs.map(a=>' '+a.name+'="'+xmlEscape(a.value)+'"').join('')+'>';depth++;
  });
  parser.on('closetag',tag=>{output+='</'+(tag.uri===MAIN_NS?tag.local:tag.name)+'>';depth--;});
  parser.on('text',value=>{output+=xmlEscape(value);});
  parser.on('cdata',value=>{output+=xmlEscape(value);});
  parser.write(xml).close();
  return output;
}

// Bound decompressed uploads before parsing. Never evaluate formulas or macros.
export async function loadSpreadsheet(buffer,fileName='') {
  const extension=path.extname(fileName).toLowerCase();
  if(!Buffer.isBuffer(buffer)||!buffer.length)throw Object.assign(new Error('The spreadsheet is empty.'),{status:400});
  if(!['.xlsx','.xlsm','.csv'].includes(extension))throw Object.assign(new Error('Use an .xlsx, .xlsm or .csv spreadsheet.'),{status:415});
  if(buffer.length>25*1024*1024)throw Object.assign(new Error('The spreadsheet exceeds 25 MB.'),{status:413});
  try{
    const workbook=new ExcelJS.Workbook();
    if(extension==='.csv'){
      await workbook.csv.read(Readable.from([buffer]),{map:value=>value});
    }else{
      const archive=await JSZip.loadAsync(buffer);
      const entries=Object.values(archive.files);
      const expanded=entries.reduce((total,file)=>total+(file._data?.uncompressedSize||0),0);
      if(entries.length>5000||expanded>80*1024*1024)throw new Error('The expanded workbook is too large. Split it into smaller files.');
      // Normalize only spreadsheet namespaces; relationship attributes remain intact.
      for(const entry of entries){
        if(entry.name.startsWith('xl/')&&entry.name.endsWith('.xml')){
          const xml=await entry.async('string');
          if(/xmlns:[^=]+=["']http:\/\/schemas.openxmlformats.org\/spreadsheetml\/2006\/main["']/.test(xml))archive.file(entry.name,normalizeSpreadsheetXml(xml));
        }else if(entry.name.startsWith('xl/')&&entry.name.endsWith('.rels')){
          const base=path.posix.dirname(entry.name.replace('/_rels/','/').replace(/\.rels$/,''));
          archive.file(entry.name,normalizeSpreadsheetXml(await entry.async('string'),base));
        }
      }
      await workbook.xlsx.load(await archive.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
    }
    if(!workbook.worksheets.length)throw new Error('No readable worksheets found.');
    let cells=0;
    for(const sheet of workbook.worksheets){
      if(sheet.rowCount>200000)throw new Error('Too many rows. Split the spreadsheet into smaller files.');
      sheet.eachRow(row=>{cells+=row.cellCount;});
    }
    if(cells>2000000)throw new Error('Too many cells. Split the spreadsheet into smaller files.');
    return workbook;
  }catch(error){throw Object.assign(new Error(`Unable to read spreadsheet: ${error.message}`),{status:422});}
}
