import crypto from 'node:crypto';
import {getIntegration,integrationReady} from './integrations.js';
let tokenCache;
export async function gmailAccessToken(){
 const v=await getIntegration('gmail');
 if(!integrationReady('gmail',v))throw Object.assign(new Error('Email-code sign-in needs the Gmail connection. Ask the Super Admin to configure it.'),{status:503,safe:true});
 const signature=crypto.createHash('sha256').update(JSON.stringify([v.client_id,v.client_secret,v.refresh_token])).digest('hex');
 if(tokenCache?.signature===signature&&tokenCache.expires>Date.now())return {token:tokenCache.token,sender:v.sender_email};
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:v.client_id,client_secret:v.client_secret,refresh_token:v.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
 const body=await response.json().catch(()=>({}));
 if(!response.ok||!body.access_token)throw Object.assign(new Error('The Gmail connection needs attention. Ask the Super Admin to reconnect the Google account.'),{status:503,safe:true});
 if(body.scope&&!body.scope.split(' ').includes('https://www.googleapis.com/auth/gmail.send'))throw Object.assign(new Error('The Google account needs the Gmail send permission.'),{status:503,safe:true});
 tokenCache={signature,token:body.access_token,expires:Date.now()+Math.max(0,(Number(body.expires_in)||3600)-60)*1000};return {token:body.access_token,sender:v.sender_email};
}
export async function sendLoginCode(email,code){
 if(/[\r\n]/.test(email))throw new Error('Invalid sign-in email.');
 const {token,sender}=await gmailAccessToken();
 const mime=[`From: ${sender}`,`To: ${email}`,'Subject: Your PartCast sign-in code','MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','',`Your PartCast sign-in code is ${code}.`,`It expires in 10 minutes. Enter it after your password.`,`If you did not request this code, ignore this email.`].join('\r\n');
 const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({raw:Buffer.from(mime).toString('base64url')}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Object.assign(new Error('The sign-in email could not be sent. Ask the Super Admin to check Gmail access and the sender account.'),{status:503,safe:true});
}
