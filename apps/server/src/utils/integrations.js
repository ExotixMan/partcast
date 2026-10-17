import crypto from 'node:crypto';
import {z} from 'zod';
import {config} from '../config.js';
import {adminDb} from '../supabase.js';
const key=()=>crypto.createHash('sha256').update(config.INTEGRATION_ENCRYPTION_KEY||config.IP_HASH_SECRET).digest();
export function encryptIntegration(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),bytes].map(b=>b.toString('base64url')).join('.');}
export function decryptIntegration(value){const [iv,tag,bytes]=value.split('.').map(s=>Buffer.from(s,'base64url'));const decipher=crypto.createDecipheriv('aes-256-gcm',key(),iv);decipher.setAuthTag(tag);return JSON.parse(Buffer.concat([decipher.update(bytes),decipher.final()]).toString('utf8'));}
const safeText=n=>z.string().trim().max(n).refine(s=>!/[\r\n]/.test(s),'Use a single line.');
export const integrationSchemas={
 gmail:z.object({enabled:z.boolean().optional(),client_id:safeText(500).optional(),client_secret:safeText(1000).optional(),refresh_token:safeText(4096).optional(),sender_email:z.string().trim().email().max(254).optional()}),
 gemini:z.object({enabled:z.boolean().optional(),api_key:safeText(500).optional(),model:z.string().trim().regex(/^gemini-[a-zA-Z0-9.-]+$/).max(100).optional()})
};
const fallback=provider=>provider==='gmail'?{enabled:true,client_id:config.GMAIL_CLIENT_ID,client_secret:config.GMAIL_CLIENT_SECRET,refresh_token:config.GMAIL_REFRESH_TOKEN,sender_email:config.GMAIL_SENDER_EMAIL}:{enabled:true,api_key:config.GEMINI_API_KEY,model:config.GEMINI_MODEL};
let cache=new Map();
export const clearIntegrationCache=()=>{cache.clear();};
export async function getIntegration(provider){
 const cached=cache.get(provider);if(cached&&Date.now()-cached.at<15000)return cached.value;
 const {data,error}=await adminDb.from('integration_settings').select('enabled,encrypted_config,updated_at').eq('provider',provider).maybeSingle();if(error)throw Object.assign(new Error('API settings are unavailable. Apply the latest access and login migrations.'),{status:503,safe:true});
 let value=fallback(provider);
 if(data){try{value={...value,...decryptIntegration(data.encrypted_config),enabled:data.enabled};}catch{throw Object.assign(new Error('Saved API settings could not be opened. The Super Admin must enter them again using the original encryption key.'),{status:503,safe:true});}}
 cache.set(provider,{at:Date.now(),value});return value;
}
export function integrationReady(provider,value){return value.enabled&&(provider==='gmail'?['client_id','client_secret','refresh_token','sender_email']:['api_key','model']).every(k=>Boolean(value[k]));}
export async function integrationStatuses(){return Promise.all(['gmail','gemini'].map(async provider=>{const v=await getIntegration(provider);return {provider,enabled:v.enabled,ready:Boolean(integrationReady(provider,v)),model:provider==='gemini'?v.model:undefined,sender_email:provider==='gmail'?v.sender_email:undefined,fields:Object.fromEntries(Object.keys(fallback(provider)).filter(k=>k!=='enabled').map(k=>[k,Boolean(v[k])]))};}));}
export async function saveIntegration(provider,patch,userId){
 const clean=integrationSchemas[provider].parse(patch),previous=await getIntegration(provider);
 if(provider==='gmail'&&clean.enabled===false)throw Object.assign(new Error('Gmail must remain enabled because email codes are required for login.'),{status:422,safe:true});
 const next={...previous,...Object.fromEntries(Object.entries(clean).filter(([k,v])=>k==='enabled'||v!==''))};
 if(next.enabled&&!integrationReady(provider,next))throw Object.assign(new Error('Complete all required connection fields before enabling this API.'),{status:422,safe:true});
 const {error}=await adminDb.from('integration_settings').upsert({provider,enabled:next.enabled,encrypted_config:encryptIntegration(next),updated_at:new Date().toISOString(),updated_by:userId},{onConflict:'provider'});if(error)throw error;clearIntegrationCache();return (await integrationStatuses()).find(v=>v.provider===provider);
}
