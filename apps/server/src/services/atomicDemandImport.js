import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {adminDb} from '../supabase.js';
import {config} from '../config.js';

const fail=(message,code,status=422)=>Object.assign(new Error(message),{safe:true,code,status});
const planHash=plan=>createHash('sha256').update(JSON.stringify(plan)).digest('hex');
const signature=value=>createHmac('sha256',config.IP_HASH_SECRET).update(value).digest();
function databaseError(error){
 if(['PGRST202','42883','PGRST204'].includes(error.code))return fail('Safe forecasting import is not installed. Apply migration 0015_atomic_demand_import.sql before importing. Existing history was not replaced.','IMPORT_SETUP_REQUIRED',503);
 if(error.code==='55P03')return fail('Another history replacement is running. Wait, then retry this import.','IMPORT_BUSY',409);
 if(error.code==='PT409'&&error.message==='IMPORT_HISTORY_CHANGED')return fail('Imported history changed after your review. Review the current replacement again before importing.','IMPORT_HISTORY_CHANGED',409);
 if(error.code==='PT409'&&error.message==='IMPORT_PREVIEW_EXPIRED')return fail('The import review expired. Review the file again before importing.','IMPORT_PREVIEW_EXPIRED',409);
 if(error.code==='42501')return fail('Only an active store manager can import sales history.','IMPORT_FORBIDDEN',403);
 if(['22023','22007','22008','23503','23514','22P02'].includes(error.code))return fail('Replacement rejected because the data or matched parts changed. Review the file again. Existing history was not replaced.','IMPORT_VALIDATION_FAILED');
 return fail('The import result could not be confirmed. Check Past imports, then retry the same file to check its saved receipt.','IMPORT_UNCONFIRMED',503);
}

export async function reviewDemandImport(plan,userId,fileSha256,db=adminDb){
 const {data,error}=await db.rpc('demand_import_snapshot');
 if(error)throw databaseError(error);
 if(!data||!Number.isInteger(data.row_count)||!/^[a-f0-9]{64}$/.test(data.fingerprint||''))throw fail('The import review could not be loaded. Existing history was not replaced.','IMPORT_REVIEW_UNAVAILABLE',503);
 const payload={purpose:'replace-imported-demand',actor:userId,requestId:randomUUID(),fileSha256,planHash:planHash(plan),fingerprint:data.fingerprint,expiresAt:new Date(Date.now()+10*60000).toISOString()};
 const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
 return {requiresConfirmation:true,detectedType:'demand-training',selectedSheet:plan.sheetName,rowsRead:plan.rowsRead,rowsImported:plan.rows.length,rowsSkipped:plan.zeroRows,matchedProducts:new Set(plan.rows.map(row=>row.product_id)).size,existingImportedRows:data.row_count,existingActualSaleRows:data.actual_rows,warnings:plan.warnings,previewToken:encoded+'.'+signature(encoded).toString('base64url')};
}

export async function commitDemandImport(plan,userId,fileName,fileSha256,token,db=adminDb){
 if(typeof token!=='string'||token.length>4000)throw fail('Review and confirm the complete history replacement before importing.','IMPORT_REVIEW_REQUIRED',409);
 const [encoded,proof,...extra]=token.split('.');
 let payload;
 try{
  const signed=Buffer.from(proof||'','base64url'),expected=signature(encoded);
  if(extra.length||signed.length!==expected.length||!timingSafeEqual(signed,expected))throw new Error();
  payload=JSON.parse(Buffer.from(encoded,'base64url').toString());
 }catch{throw fail('The import review is invalid. Review the file again.','IMPORT_REVIEW_REQUIRED',409);}
 if(payload.purpose!=='replace-imported-demand'||payload.actor!==userId||payload.fileSha256!==fileSha256||payload.planHash!==planHash(plan))throw fail('The file or matched parts changed after review. Review the replacement again.','IMPORT_REVIEW_REQUIRED',409);
 const {data,error}=await db.rpc('replace_imported_demand',{
  p_request_id:payload.requestId,p_actor:userId,p_file_name:fileName,p_file_sha256:fileSha256,p_sheet_name:plan.sheetName,
  p_expected_fingerprint:payload.fingerprint,p_expires_at:payload.expiresAt,p_rows:plan.rows,p_rows_read:plan.rowsRead,p_zero_rows:plan.zeroRows,p_warnings:plan.warnings
 });
 if(error)throw databaseError(error);
 if(!data?.batchId||!Number.isInteger(data.rowsImported))throw fail('The import response could not be confirmed. Check Past imports, then retry the same file.','IMPORT_UNCONFIRMED',503);
 return {...data,detectedType:'demand-training',selectedSheet:plan.sheetName,warnings:[...plan.warnings,...(data.alreadyImported?['This reviewed import was already saved. No history was changed by this retry.']:[])]};
}
