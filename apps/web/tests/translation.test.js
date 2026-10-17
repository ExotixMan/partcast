import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{parse}=require('@babel/parser'),traverse=require('@babel/traverse').default;
const translations=JSON.parse(await readFile(new URL('../src/lib/tagalog.json',import.meta.url),'utf8'));
test('every explicit interface translation key has a Tagalog entry with matching placeholders',async()=>{
 const files=[];for(const dir of ['pages','components'])for(const file of await readdir(new URL(`../src/${dir}/`,import.meta.url)))if(file.endsWith('.jsx'))files.push(`../src/${dir}/${file}`);
 const missing=new Set();
 for(const file of files){const ast=parse(await readFile(new URL(file,import.meta.url),'utf8'),{sourceType:'module',plugins:['jsx']});traverse(ast,{CallExpression(p){if(p.node.callee.name!=='t')return;const key=p.node.arguments[0]?.value;if(typeof key!=='string'||!/[A-Za-z]/.test(key)||/^(PartCast|NPG)/.test(key)||key==='supplier@example.com')return;const translated=Object.hasOwn(translations,key)?translations[key]:translations[key.trim()];if(translated===undefined)missing.add(key);else assert.deepEqual([...key.matchAll(/\{v\d+\}/g)].map(x=>x[0]).sort(),[...translated.matchAll(/\{v\d+\}/g)].map(x=>x[0]).sort(),key);}});}
 assert.deepEqual([...missing],[]);
});
