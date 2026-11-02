import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PassThrough} from 'node:stream';
import ExcelJS from 'exceljs';

const require=createRequire(import.meta.url),excelRequire=createRequire(require.resolve('exceljs'));
const archive=excelRequire('archiver'),archiveRequire=createRequire(excelRequire.resolve('archiver'));
const {file}=archiveRequire('archiver-utils'),unzipper=excelRequire('unzipper');

test('patched archive dependencies preserve glob exclusions and ZIP contents',async()=>{
  const root=await mkdtemp(join(tmpdir(),'partcast-archive-'));
  try{
    await mkdir(join(root,'nested'));
    await Promise.all([writeFile(join(root,'part.txt'),'Air filter'),writeFile(join(root,'ignored.txt'),'excluded'),writeFile(join(root,'nested','other.txt'),'Brake pad')]);
    assert.deepEqual(file.expand({cwd:root},['*.txt','!ignored.txt']),['part.txt']);
    const zip=archive('zip'),chunks=[];
    const done=new Promise((resolve,reject)=>{zip.on('data',chunk=>chunks.push(chunk));zip.on('end',resolve);zip.on('error',reject);});
    zip.glob('**/*.txt',{cwd:root,ignore:['ignored.txt']});await zip.finalize();await done;
    const result=await unzipper.Open.buffer(Buffer.concat(chunks));
    assert.deepEqual(result.files.map(entry=>entry.path).sort(),['nested/other.txt','part.txt']);
    assert.equal((await result.files.find(entry=>entry.path==='part.txt').buffer()).toString(),'Air filter');
  }finally{await rm(root,{recursive:true,force:true});}
});

test('ExcelJS streaming exports remain readable with the patched ZIP dependencies',async()=>{
  const stream=new PassThrough(),chunks=[];
  stream.on('data',chunk=>chunks.push(chunk));
  const workbook=new ExcelJS.stream.xlsx.WorkbookWriter({stream,useSharedStrings:true});
  const sheet=workbook.addWorksheet('Customer balances');sheet.addRow(['Customer','Remaining balance']).commit();sheet.addRow(['Alex',13.25]).commit();sheet.commit();
  await workbook.commit();
  const read=new ExcelJS.Workbook();await read.xlsx.load(Buffer.concat(chunks));
  assert.equal(read.worksheets[0].getCell('A2').value,'Alex');assert.equal(read.worksheets[0].getCell('B2').value,13.25);
});
