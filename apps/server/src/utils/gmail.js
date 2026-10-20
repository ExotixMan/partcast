import crypto from 'node:crypto';
import {z} from 'zod';
import {getIntegrationWithSource,integrationReady} from './integrations.js';
let tokenCache;
const oauthMessages={
 invalid_client:['GMAIL_OAUTH_INVALID_CLIENT','Google rejected the Gmail client ID or client secret. Ask the Super Admin to check the matching Google OAuth credentials.'],
 invalid_grant:['GMAIL_OAUTH_INVALID_GRANT','The Gmail refresh token expired, was revoked, or belongs to another Google client. Ask the Super Admin to reconnect the sending Google account.'],
 unauthorized_client:['GMAIL_OAUTH_UNAUTHORIZED_CLIENT','This Google client is not authorized to send sign-in emails. Ask the Super Admin to check the OAuth client configuration.'],
 access_denied:['GMAIL_OAUTH_ACCESS_DENIED','Google denied Gmail access. Ask the Super Admin to authorize the sending Google account.'],
 invalid_scope:['GMAIL_OAUTH_INVALID_SCOPE','The Google account needs the Gmail send permission.'],
 invalid_request:['GMAIL_OAUTH_INVALID_REQUEST','Google could not accept the Gmail connection settings. Ask the Super Admin to check the saved OAuth credentials.'],
 unsupported_grant_type:['GMAIL_OAUTH_INVALID_REQUEST','Google could not accept the Gmail connection settings. Ask the Super Admin to check the saved OAuth credentials.']
};
const unavailable=['GMAIL_OAUTH_UNAVAILABLE','Google email access is temporarily unavailable. Please try again shortly.'];
const unexpected=['GMAIL_OAUTH_BAD_RESPONSE','Google returned an unexpected Gmail authorization response. Try again or ask the Super Admin to check the connection.'];
function connectionError([code,message],source,{httpStatus=null,googleError=null}={}){


 const settings=source==='saved_partcast_settings'?'saved PartCast IT settings':'API environment variables';
 const hint=code==='GMAIL_OAUTH_INVALID_CLIENT'
  ? `Check the matching Google OAuth client ID and client secret in ${settings}.`
  : code==='GMAIL_OAUTH_INVALID_GRANT'
  ? `Authorize gmail.send with the same OAuth client and replace the refresh token in ${settings}. External apps in Testing can have seven-day refresh tokens.`
  : code==='GMAIL_OAUTH_UNAVAILABLE'?'Retry shortly. If repeated, check the API network connection and Google service status.'
  : `Check Gmail authorization in ${settings}.`;
 return Object.assign(new Error(message),{status:503,safe:true,code,hint,
  details:{provider:'gmail',stage:'oauth_token',settings_source:source,http_status:httpStatus,google_error:googleError}});
}
export async function gmailAccessToken(){
 const {value:v,source}=await getIntegrationWithSource('gmail');
 if(!integrationReady('gmail',v))throw connectionError(['GMAIL_NOT_CONFIGURED','Email needs the Gmail connection. Ask the Super Admin to configure it.'],source);
 const signature=crypto.createHash('sha256').update(JSON.stringify([v.client_id,v.client_secret,v.refresh_token])).digest('hex');
 if(tokenCache?.signature===signature&&tokenCache.expires>Date.now())return {token:tokenCache.token,sender:v.sender_email};
 let response;
 try{
  response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:v.client_id,client_secret:v.client_secret,refresh_token:v.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
 }catch{throw connectionError(unavailable,source);}
 let body;
 try{body=await response.json();}catch{body=null;}
 if(!body||typeof body!=='object'||Array.isArray(body))body={};

 const googleError=typeof body.error==='string'&&Object.hasOwn(oauthMessages,body.error)?body.error:null;
 if(response.status===429||response.status>=500)throw connectionError(unavailable,source,{httpStatus:response.status});
 if(!response.ok||typeof body.access_token!=='string'||!body.access_token.trim())
  throw connectionError(googleError?oauthMessages[googleError]:unexpected,source,{httpStatus:response.status,googleError});
 if(body.scope!==undefined&&(typeof body.scope!=='string'||!body.scope.split(/\s+/).includes('https://www.googleapis.com/auth/gmail.send')))
  throw connectionError(oauthMessages.invalid_scope,source,{httpStatus:response.status,googleError:'invalid_scope'});
 const expiresIn=Number(body.expires_in);
 const lifetime=Number.isFinite(expiresIn)&&expiresIn>0?Math.min(expiresIn,3600):3600;
 tokenCache={signature,token:body.access_token,expires:Date.now()+Math.max(0,lifetime-60)*1000};return {token:body.access_token,sender:v.sender_email};
}
export async function sendGmailMessage({to,subject,text,html}){
 const email=z.string().trim().email().max(254).refine(v=>!/[\r\n]/.test(v)).parse(to);
 const title=z.string().trim().min(2).max(180).refine(v=>!/[\r\n]/.test(v),'Use a single line for the subject.').parse(subject);
 const {token,sender}=await gmailAccessToken();
 const headers=[`From: ${sender}`,`To: ${email}`,`Subject: =?UTF-8?B?${Buffer.from(title).toString('base64')}?=`,'MIME-Version: 1.0'];
 let mime;
 if(html){
  const boundary=`partcast_${crypto.randomBytes(24).toString('hex')}`;
  mime=[...headers,`Content-Type: multipart/alternative; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: 8bit','',text||'',`--${boundary}`,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: 8bit','',html,`--${boundary}--`,''].join('\r\n');
 }else mime=[...headers,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: 8bit','',text||''].join('\r\n');
 let response;
 try{response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({raw:Buffer.from(mime).toString('base64url')}),signal:AbortSignal.timeout(15000)});}
 catch{throw Object.assign(new Error('Gmail delivery could not be confirmed. Check Gmail Sent before sending another request.'),{status:503,safe:true,code:'GMAIL_SEND_UNCONFIRMED',deliveryUncertain:true});}
 if(!response.ok)throw Object.assign(new Error('The email could not be sent. Ask the Super Admin to check Gmail access and the sender account.'),{status:503,safe:true,deliveryUncertain:response.status>=500});
 const result=await response.json().catch(()=>({}));return {messageId:result.id||null};
}
export async function sendLoginCode(email,code){
 return sendGmailMessage({to:email,subject:'Your PartCast sign-in code',text:`Your PartCast sign-in code is ${code}.\nIt expires in 10 minutes. Enter it after your password.\nIf you did not request this code, ignore this email.`});
}
