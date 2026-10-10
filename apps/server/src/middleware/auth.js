import crypto from 'node:crypto';
import { config } from '../config.js';
import { adminDb } from '../supabase.js';

// Claims are decoded only after Supabase validates the bearer token.
export function sessionClaims(token){try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());}catch{return {};}}
export async function authenticateBase(req,res,next){
 try{
  const header=req.headers.authorization||'',token=header.startsWith('Bearer ')?header.slice(7):null;
  if(!token)return res.status(401).json({error:'Authentication required.'});
  const {data,error}=await adminDb.auth.getUser(token);
  if(error&&(error.name==='AuthRetryableFetchError'||error.status>=500||error.status===0))throw Object.assign(new Error('The sign-in service is temporarily unavailable. Your waiting changes are safe; try again shortly.'),{status:503,safe:true});
  if(error||!data.user)return res.status(401).json({error:'Invalid or expired session.'});
  const claims=sessionClaims(token);
  if(!/^[0-9a-f-]{36}$/i.test(claims.session_id||'')||!Array.isArray(claims.amr)||!claims.amr.some(a=>a.method==='password'))return res.status(401).json({code:'PASSWORD_REQUIRED',error:'Sign in with your password before requesting an email code.'});
  const {data:profile,error:profileError}=await adminDb.from('profiles').select('id,full_name,role,active').eq('id',data.user.id).single();
  if(profileError&&profileError.code!=='PGRST116')throw Object.assign(new Error('Could not check your staff account. Your waiting changes are safe; try again shortly.'),{status:503,safe:true});
  if(!profile?.active)return res.status(403).json({error:'Account is inactive or not provisioned.'});
  req.user={...profile,email:data.user.email,accessToken:token,session_id:claims.session_id};return next();
 }catch(e){next(e);}
}
export function authenticate(req,res,next){
 return authenticateBase(req,res,async error=>{
  if(error)return next(error);
  try{
   const {data,error:dbError}=await adminDb.from('login_verifications').select('expires_at').eq('session_id',req.user.session_id).eq('user_id',req.user.id).maybeSingle();
   if(dbError)throw Object.assign(new Error('Secure login is not ready. Apply the latest login migration and configure Gmail.'),{status:503,safe:true});
   if(!data||!Number.isFinite(Date.parse(data.expires_at))||Date.parse(data.expires_at)<=Date.now())return res.status(428).json({code:'OTP_REQUIRED',error:'Enter the email code to finish signing in.'});
   req.user.verification_expires_at=data.expires_at;next();
  }catch(e){next(e);}
 });
}
export function requireRole(...roles){return(req,res,next)=>{if(!req.user||!(req.user.role==='super_admin'||roles.includes(req.user.role)))return res.status(403).json({error:'You do not have permission to perform this action.'});next();};}
export function authorizeApi(req,res,next){
 if(req.user.role!=='cashier')return next();
 const path=req.path,read=req.method==='GET';
 const allowed=read&&(/^\/(me|offline-snapshot|products|suppliers|barcode\/[^/]+|photos\/[^/]+\/[^/]+|notifications|assistant\/status)$/.test(path))||req.method==='PATCH'&&path==='/me'||req.method==='POST'&&(path==='/inventory/batch'||path==='/assistant/chat'||/^\/notifications\/[^/]+\/read$/.test(path));
 if(!allowed)return res.status(403).json({error:'Cashier access is limited to selling, receiving and viewing inventory.'});next();
}
export function cronAuth(req,res,next){const secret=req.headers['x-cron-secret'];if(typeof secret!=='string'||Buffer.byteLength(secret)!==Buffer.byteLength(config.CRON_SECRET)||!crypto.timingSafeEqual(Buffer.from(secret),Buffer.from(config.CRON_SECRET)))return res.status(401).json({error:'Invalid job secret.'});next();}
