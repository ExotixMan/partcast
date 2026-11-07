import {test,expect} from '@playwright/test';
const user='11111111-1111-4111-8111-111111111111',session='77777777-7777-4777-8777-777777777777';
const token=`e30.${Buffer.from(JSON.stringify({session_id:session,amr:[{method:'password'}]})).toString('base64url')}.fixture`;
const file={name:'actual-history.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('Fixture upload; actual parsing is covered by backend integration tests.')};

async function fixture(context,{failure=null,lostResponse=false,staleReview=false,invalidPreview=false}={}){
 await context.addInitScript(({user,token})=>{
  localStorage.setItem('sb-ragdjkdcrvexqfadlqbf-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:user,email:'owner@example.test',aud:'authenticated'}}));
  localStorage.setItem('partcast-language','en');
 },{user,token});
 const state={previews:0,commits:[],saved:false};
 await context.route('http://localhost:10000/**',async route=>{
  const request=route.request(),url=new URL(request.url()),headers={'access-control-allow-origin':'*'};
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type'}});
  let body={data:[]};
  if(url.pathname==='/api/me')body={user:{id:user,role:'owner',active:true,session_id:session,full_name:'Owner',verification_expires_at:'2099-01-01T00:00:00Z'}};
  else if(['/api/imports/spreadsheet','/api/imports/spreadsheet/preview'].includes(url.pathname)){
   const data=request.postDataBuffer().toString();
   if(/name="preview"\r\n\r\ntrue/.test(data)){
    expect(url.pathname).toBe('/api/imports/spreadsheet/preview');
    state.previews++;
    if(invalidPreview)return route.fulfill({headers,json:{data:[]}});
    if(failure)return route.fulfill({headers,status:failure.status,json:{code:failure.code,error:failure.message}});
    body={requiresConfirmation:true,detectedType:'demand-training',previewToken:'review-'+state.previews,rowsRead:701,rowsImported:701,rowsSkipped:0,existingImportedRows:37272,existingActualSaleRows:34,selectedSheet:'Daily_B_Usable',warnings:[]};
   }else{
    const proof=data.match(/name="previewToken"\r\n\r\n([^\r\n]+)/)?.[1];state.commits.push(proof);
    if(staleReview&&state.commits.length===1)return route.fulfill({headers,status:409,json:{code:'IMPORT_HISTORY_CHANGED',error:'Imported history changed after your review. Review the current replacement again before importing.'}});
    if(lostResponse&&state.commits.length===1){state.saved=true;return route.abort('failed');}
    body={batchId:'fixture-import',rowsImported:state.saved?0:701,rowsSkipped:0,alreadyImported:state.saved,selectedSheet:'Daily_B_Usable',warnings:state.saved?['This reviewed import was already saved. No history was changed by this retry.']:[]};state.saved=true;
   }
  }
  return route.fulfill({headers,json:body});
 });
 return state;
}

test('replacement shows the exact impact and cancellation sends no commit',async({page,context})=>{
 const state=await fixture(context);await page.goto('/imports');
 await page.getByLabel('What is in these files?').selectOption('demand-training');
 await page.getByLabel('Choose spreadsheet files').setInputFiles(file);
 let message='';page.once('dialog',async dialog=>{message=dialog.message();await dialog.dismiss();});
 await page.getByRole('button',{name:'Import 1 file',exact:true}).click();
 await expect(page.getByRole('region',{name:'Latest import results'})).toContainText('Import cancelled. No history was changed.');
 expect(message).toContain('37272');expect(message).toContain('701');expect(message).toContain('34');expect(state.previews).toBe(1);expect(state.commits).toEqual([]);
});

test('an unsupported or malformed preview response never falls back to a direct import',async({page,context})=>{
 const state=await fixture(context,{invalidPreview:true});await page.goto('/imports');
 await page.getByLabel('Choose spreadsheet files').setInputFiles(file);
 await page.getByRole('button',{name:'Import 1 file',exact:true}).click();
 await expect(page.getByRole('region',{name:'Latest import results'})).toContainText('The import review could not be confirmed. No import was requested.');
 expect(state.commits).toEqual([]);
});

test('a lost response keeps the confirmed request and retry checks its saved receipt',async({page,context})=>{
 const state=await fixture(context,{lostResponse:true});await page.goto('/imports');
 await page.getByLabel('Choose spreadsheet files').setInputFiles(file);
 let confirmations=0;page.on('dialog',async dialog=>{confirmations++;await dialog.accept();});
 const button=page.getByRole('button',{name:'Import 1 file',exact:true});await button.click();
 const result=page.getByRole('region',{name:'Latest import results'});
 await expect(result).toContainText('Import status unconfirmed:');await expect(result).toContainText('Check Past imports');
 await button.click();await expect(result).toContainText('This reviewed import was already saved. No history was changed by this retry.');
 expect(state.previews).toBe(1);expect(state.commits).toEqual(['review-1','review-1']);expect(confirmations).toBe(1);
});

test('multiple forecasting files are blocked before any replacement',async({page,context})=>{
 const state=await fixture(context);await page.goto('/imports');
 await page.getByLabel('Choose spreadsheet files').setInputFiles([file,{...file,name:'second-history.xlsx'}]);
 await page.getByRole('button',{name:'Import 2 files',exact:true}).click();
 await expect(page.getByRole('region',{name:'Latest import results'})).toContainText('Choose one complete forecasting history file at a time. No files were imported.');
 expect(state.commits).toEqual([]);
});

test('a stale review requires a new preview and explicit confirmation',async({page,context})=>{
 const state=await fixture(context,{staleReview:true});await page.goto('/imports');
 await page.getByLabel('Choose spreadsheet files').setInputFiles(file);
 let confirmations=0;page.on('dialog',async dialog=>{confirmations++;await dialog.accept();});
 const button=page.getByRole('button',{name:'Import 1 file',exact:true});await button.click();
 const result=page.getByRole('region',{name:'Latest import results'});await expect(result).toContainText('Imported history changed after your review.');
 await button.click();await expect(result).toContainText('701 rows added');
 expect(state.previews).toBe(2);expect(state.commits).toEqual(['review-1','review-2']);expect(confirmations).toBe(2);
});

for(const failure of [
 {status:503,code:'IMPORT_SETUP_REQUIRED',message:'Safe forecasting import is not installed. Apply migration 0015_atomic_demand_import.sql before importing. Existing history was not replaced.'},
 {status:422,code:'IMPORT_VALIDATION_FAILED',message:'Import rejected: Row 3: Part MISSING was not found in active Inventory. No history was changed.'}
])test(`preview failure ${failure.code} stops before confirmation or saving`,async({page,context})=>{
 const state=await fixture(context,{failure});await page.goto('/imports');
 await page.getByLabel('Choose spreadsheet files').setInputFiles(file);
 await page.getByRole('button',{name:'Import 1 file',exact:true}).click();
 const result=page.getByRole('region',{name:'Latest import results'});
 await expect(result).toContainText(failure.message);await expect(result.getByText('Import status unconfirmed:',{exact:false})).toHaveCount(0);
 expect(state.commits).toEqual([]);
});
