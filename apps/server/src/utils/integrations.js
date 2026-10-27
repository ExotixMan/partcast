import crypto from 'node:crypto';
import {z} from 'zod';
import {config} from '../config.js';
import {adminDb} from '../supabase.js';
import {googleAppPasswordSchema,gmailDeliveryMethod} from './gmail-config.js';
import {verifyGmailSmtp} from './gmail-smtp.js';
const key=()=>crypto.createHash('sha256').update(config.INTEGRATION_ENCRYPTION_KEY||config.IP_HASH_SECRET).digest();
export function encryptIntegration(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),bytes].map(b=>b.toString('base64url')).join('.');}
export function decryptIntegration(value){const [iv,tag,bytes]=value.split('.').map(s=>Buffer.from(s,'base64url'));const decipher=crypto.createDecipheriv('aes-256-gcm',key(),iv);decipher.setAuthTag(tag);return JSON.parse(Buffer.concat([decipher.update(bytes),decipher.final()]).toString('utf8'));}
const safeText=n=>z.string().trim().max(n).refine(s=>!/[\r\n]/.test(s),'Use a single line.');
export const integrationSchemas={
 gmail:z.object({enabled:z.boolean().optional(),delivery_method:z.enum(['oauth','smtp']).optional(),app_password:googleAppPasswordSchema.optional(),client_id:safeText(500).optional(),client_secret:safeText(1000).optional(),refresh_token:safeText(4096).optional(),sender_email:z.string().trim().email().max(254).optional()}),
 gemini:z.object({enabled:z.boolean().optional(),api_key:safeText(500).optional(),model:z.string().trim().regex(/^gemini-[a-zA-Z0-9.-]+$/).max(100).optional()})
};
const fallback=provider=>provider==='gmail'?{enabled:true,delivery_method:config.GMAIL_DELIVERY_METHOD,app_password:config.GMAIL_APP_PASSWORD,client_id:config.GMAIL_CLIENT_ID,client_secret:config.GMAIL_CLIENT_SECRET,refresh_token:config.GMAIL_REFRESH_TOKEN,sender_email:config.GMAIL_SENDER_EMAIL}:{enabled:true,api_key:config.GEMINI_API_KEY,model:config.GEMINI_MODEL};
let cache=new Map();
export const clearIntegrationCache=()=>{cache.clear();};
export async function getIntegrationWithSource(provider){
 const cached=cache.get(provider);if(cached&&Date.now()-cached.at<15000)return {value:cached.value,source:cached.source};
 const {data,error}=await adminDb.from('integration_settings').select('enabled,encrypted_config,updated_at').eq('provider',provider).maybeSingle();if(error)throw Object.assign(new Error('API settings are unavailable. Apply the latest access and login migrations.'),{status:503,safe:true});
 let value=fallback(provider);
 if(data){try{const saved=decryptIntegration(data.encrypted_config);value={...value,...saved,enabled:data.enabled};if(provider==='gmail')value.delivery_method=saved.delivery_method??'oauth';}catch{throw Object.assign(new Error('Saved API settings could not be opened. The Super Admin must enter them again using the original encryption key.'),{status:503,safe:true});}}
 const source=data?'saved_partcast_settings':'api_environment';
 cache.set(provider,{at:Date.now(),value,source});return {value,source};
}
export async function getIntegration(provider){return (await getIntegrationWithSource(provider)).value;}
export function integrationReady(provider,value){
 if(!value.enabled)return false;
 if(provider==='gmail'){
  if(gmailDeliveryMethod(value)==='smtp')return Boolean(value.sender_email&&/^[A-Za-z0-9]{16}$/.test(value.app_password||''));
  if(gmailDeliveryMethod(value)!=='oauth')return false;
  return ['client_id','client_secret','refresh_token','sender_email'].every(key=>Boolean(value[key]));
 }
 return ['api_key','model'].every(key=>Boolean(value[key]));
}
export async function integrationStatuses(){return Promise.all(['gmail','gemini'].map(async provider=>{const v=await getIntegration(provider);return {provider,enabled:v.enabled,ready:Boolean(integrationReady(provider,v)),smtp_supported:provider==='gmail'?true:undefined,delivery_method:provider==='gmail'?gmailDeliveryMethod(v):undefined,model:provider==='gemini'?v.model:undefined,sender_email:provider==='gmail'?v.sender_email:undefined,fields:Object.fromEntries(Object.keys(fallback(provider)).filter(k=>!['enabled','delivery_method'].includes(k)).map(k=>[k,Boolean(v[k])]))};}));}
export async function saveIntegration(provider,patch,userId){
 const clean=integrationSchemas[provider].parse(patch),previous=await getIntegration(provider);
 if(provider==='gmail'&&clean.enabled===false)throw Object.assign(new Error('Gmail must remain enabled because email codes are required for login.'),{status:422,safe:true});
 const next={...previous,...Object.fromEntries(Object.entries(clean).filter(([k,v])=>k==='enabled'||v!==''))};
 if(next.enabled&&!integrationReady(provider,next))throw Object.assign(new Error('Complete all required connection fields before enabling this API.'),{status:422,safe:true});
 if(provider==='gmail'&&gmailDeliveryMethod(next)==='smtp')await verifyGmailSmtp(next,'submitted_partcast_settings');
 const {error}=await adminDb.from('integration_settings').upsert({provider,enabled:next.enabled,encrypted_config:encryptIntegration(next),updated_at:new Date().toISOString(),updated_by:userId},{onConflict:'provider'});if(error)throw error;clearIntegrationCache();return (await integrationStatuses()).find(v=>v.provider===provider);
}
