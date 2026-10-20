import crypto from 'node:crypto';
import {adminDb} from '../supabase.js';
import {sendSupplierEmail,recommendationHash} from '../utils/email.js';
import {supplierParts} from '../utils/supplierParts.js';
import {neededRestock,normalizeRestock} from '../utils/restock.js';
import {fetchAll} from '../utils/helpers.js';

const problem=(message,status=409,code='SUPPLIER_EMAIL_UNCONFIRMED')=>Object.assign(new Error(message),{status,safe:true,code});
const pending=()=>problem('Delivery is not confirmed. Check Gmail Sent or contact the supplier before creating another request.');

export async function prepareSupplierRequest(supplierId,draft){
 const recommendations=draft?await supplierParts(supplierId,draft.items.map(i=>i.product_id)):
  (await fetchAll(()=>neededRestock(adminDb.from('reorder_recommendations').select('*').eq('supplier_id',supplierId)).order('product_id'))).map(normalizeRestock);
 const available=new Map(recommendations.map(item=>[item.product_id,item]));
 if(!recommendations.length||draft?.items.some(item=>!available.has(item.product_id)))throw problem('Choose active parts assigned to this supplier.',422,'SUPPLIER_EMAIL_INVALID_PARTS');
 const supplier={id:supplierId,name:recommendations[0].supplier_name,email:recommendations[0].supplier_email};
 if(!supplier.email)throw problem('This supplier has no email address.',422,'SUPPLIER_EMAIL_NO_RECIPIENT');
 if(draft?.expected_recipient&&supplier.email.toLowerCase()!==draft.expected_recipient.toLowerCase())throw problem('The supplier email address changed. Close this request, refresh the list and review the recipient again.',409,'SUPPLIER_EMAIL_RECIPIENT_CHANGED');
 const items=draft?draft.items.map(item=>({...available.get(item.product_id),...item,recommended_quantity:item.quantity})):recommendations;
 return {supplier,items,subject:draft?.subject,message:draft?.message,extra_columns:draft?.extra_columns};
}



export function createSupplierRequestSender({db=adminDb,send=sendSupplierEmail,prepare=prepareSupplierRequest}={}){
 const find=async id=>{
  const {data,error}=await db.from('supplier_email_logs').select('*').eq('client_request_id',id).maybeSingle();
  if(error)throw error;return data;
 };
 function authorize(row,actorId,supplierId){
  if(row.sent_by!==actorId||row.supplier_id!==supplierId)throw problem('This email request belongs to another staff account or supplier.',403,'SUPPLIER_EMAIL_ACCESS');
 }
 async function status({requestId,actorId,supplierId}){
  const row=await find(requestId);
  if(!row)return {status:'not_found'};
  authorize(row,actorId,supplierId);return {status:row.status,items:row.item_count};
 }
 async function deliver({requestId,actorId,supplierId,draft}){
  const hash=crypto.createHash('sha256').update(JSON.stringify({supplierId,draft})).digest('hex');
  let previous=await find(requestId);
  if(previous){
   authorize(previous,actorId,supplierId);
   if(previous.request_hash!==hash)throw problem('This email request has already been submitted with different details. Check its sending result first.');
   if(previous.status==='sent')return {message:'Supplier email sent.',items:previous.item_count,replayed:true};
   if(previous.status!=='failed')throw pending();
  }
  const prepared=await prepare(supplierId,draft);
  const claim={client_request_id:requestId,request_hash:hash,supplier_id:supplierId,recipient_email:prepared.supplier.email,
   subject:prepared.subject||'NPG Autoparts replenishment request',request_payload:draft,recommendation_hash:recommendationHash(prepared.items),
   item_count:prepared.items.length,status:'sending',sent_by:actorId,error_message:null};
  if(previous){
   const {data,error}=await db.from('supplier_email_logs').update(claim).eq('id',previous.id).eq('status','failed').select('id').maybeSingle();
   if(error)throw error;if(!data)throw pending();
  }else{
   const {error}=await db.from('supplier_email_logs').insert(claim);
   if(error){
    if(error.code==='23505'){
     const row=await find(requestId);if(row){authorize(row,actorId,supplierId);if(row.request_hash===hash&&row.status==='sent')return {message:'Supplier email sent.',items:row.item_count,replayed:true};}
     throw pending();
    }
    throw error;
   }
  }
  let provider;
  try{provider=await send(prepared);}
  catch(error){
   const uncertain=error.deliveryUncertain===true;
   const saved=await db.from('supplier_email_logs').update({status:uncertain?'uncertain':'failed',error_message:uncertain?'Gmail delivery could not be confirmed.':'Email was not sent. Check Gmail configuration and try again.'}).eq('client_request_id',requestId);
   if(saved.error||uncertain)throw pending();
   throw error;
  }
  const saved=await db.from('supplier_email_logs').update({status:'sent',provider_message_id:provider.messageId||null,sent_at:new Date().toISOString()}).eq('client_request_id',requestId);
  if(saved.error)throw pending();
  return {message:'Supplier email sent.',items:prepared.items.length};
 }
 return {deliver,status};
}
export const supplierRequests=createSupplierRequestSender();
