import crypto from 'node:crypto';
import {appsScriptUrlSchema,appsScriptSecretSchema} from './gmail-config.js';

const messages={
 AUTH_FAILED:'The Apps Script signing key was not accepted. Check the matching key in Render and Script properties.',
 NOT_CONFIGURED:'Complete the Apps Script web app URL, signing key and sending Gmail address.',
 SENDER_MISMATCH:'The Apps Script must run as the sending Gmail account. Redeploy it with Execute as set to Me.',
 QUOTA_EXCEEDED:'The Google account has reached its Apps Script email limit. Try again after its quota resets.',
 BUSY:'The Apps Script email service is busy. Try again shortly.',
 INVALID_REQUEST:'The Apps Script could not accept this request. Update the deployed script to the current PartCast version.'
};
function failure(reason,source,{sending=false,httpStatus=null}={}){
 const definite=Object.hasOwn(messages,reason);
 const uncertain=sending&&!definite;
 const code=definite?'GMAIL_SCRIPT_'+reason:uncertain?'GMAIL_SCRIPT_UNCONFIRMED':'GMAIL_SCRIPT_UNAVAILABLE';
 const message=definite?messages[reason]:uncertain?'Gmail delivery could not be confirmed. Check the sending result before creating another request.':'The Apps Script could not be reached. Check its deployment URL and access setting.';
 return Object.assign(new Error(message),{status:503,safe:true,code,deliveryUncertain:uncertain,
  details:{provider:'gmail',stage:sending?'apps_script_send':'apps_script_check',settings_source:source,http_status:httpStatus}});
}
async function request(value,action,message,source){
 if(!value.sender_email||!appsScriptUrlSchema.safeParse(value.script_url).success||!value.script_url||!appsScriptSecretSchema.safeParse(value.script_secret).success||!value.script_secret)throw failure('NOT_CONFIGURED',source);
 const requestId=crypto.randomUUID();
 const payload=Buffer.from(JSON.stringify({version:1,action,request_id:requestId,issued_at:Date.now(),sender_email:value.sender_email,...(message?{message}:{})})).toString('base64url');
 const signature=crypto.createHmac('sha256',value.script_secret).update(payload).digest('base64url');
 const sending=action==='send';
 let response,body;
 try{
  response=await fetch(value.script_url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({payload,signature}),redirect:'follow',signal:AbortSignal.timeout(20000)});
  body=await response.json();
 }catch{throw failure('UNAVAILABLE',source,{sending});}
 if(response.ok&&body?.ok===true&&body.request_id===requestId){
  if(!sending&&Number.isInteger(body.remaining)&&body.remaining>=0)return {remaining:body.remaining};
  if(sending&&body.sent===true)return {messageId:'apps-script:'+requestId};
 }
 throw failure(typeof body?.error==='string'?body.error:'UNAVAILABLE',source,{sending,httpStatus:response.status});
}
export const checkGmailAppsScript=(value,source)=>request(value,'check',null,source);
export const sendGmailAppsScript=(value,message,source)=>request(value,'send',message,source);
