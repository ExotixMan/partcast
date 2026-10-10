import crypto from 'node:crypto';
import {z} from 'zod';
import {getIntegration,integrationReady} from './integrations.js';
let tokenCache;
export async function gmailAccessToken(){
 const v=await getIntegration('gmail');
 if(!integrationReady('gmail',v))throw Object.assign(new Error('Email needs the Gmail connection. Ask the Super Admin to configure it.'),{status:503,safe:true});
 const signature=crypto.createHash('sha256').update(JSON.stringify([v.client_id,v.client_secret,v.refresh_token])).digest('hex');
 if(tokenCache?.signature===signature&&tokenCache.expires>Date.now())return {token:tokenCache.token,sender:v.sender_email};
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:v.client_id,client_secret:v.client_secret,refresh_token:v.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
 const body=await response.json().catch(()=>({}));
 if(!response.ok||!body.access_token)throw Object.assign(new Error('The Gmail connection needs attention. Ask the Super Admin to reconnect the Google account.'),{status:503,safe:true});
 if(body.scope&&!body.scope.split(' ').includes('https://www.googleapis.com/auth/gmail.send'))throw Object.assign(new Error('The Google account needs the Gmail send permission.'),{status:503,safe:true});
 tokenCache={signature,token:body.access_token,expires:Date.now()+Math.max(0,(Number(body.expires_in)||3600)-60)*1000};return {token:body.access_token,sender:v.sender_email};
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
 const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({raw:Buffer.from(mime).toString('base64url')}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Object.assign(new Error('The email could not be sent. Ask the Super Admin to check Gmail access and the sender account.'),{status:503,safe:true});
 const result=await response.json().catch(()=>({}));return {messageId:result.id||null};
}
export async function sendLoginCode(email,code){
 return sendGmailMessage({to:email,subject:'Your PartCast sign-in code',text:`Your PartCast sign-in code is ${code}.\nIt expires in 10 minutes. Enter it after your password.\nIf you did not request this code, ignore this email.`});
}
