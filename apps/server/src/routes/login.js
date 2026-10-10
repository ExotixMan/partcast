import crypto from 'node:crypto';
import {Router} from 'express';
import {z} from 'zod';
import rateLimit from 'express-rate-limit';
import {authenticateBase} from '../middleware/auth.js';
import {adminDb} from '../supabase.js';
import {config} from '../config.js';
import {sendLoginCode} from '../utils/gmail.js';
const router=Router();router.use(authenticateBase);
const hash=(req,code)=>crypto.createHmac('sha256',config.INTEGRATION_ENCRYPTION_KEY||config.IP_HASH_SECRET).update(`${req.user.id}:${req.user.session_id}:${code}`).digest('hex');
router.post('/otp/request',rateLimit({windowMs:15*60*1000,limit:15,keyGenerator:req=>req.user.id,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many code requests. Wait before trying again.'}}),async(req,res,next)=>{
 try{
  const code=String(crypto.randomInt(0,1000000)).padStart(6,'0'),codeHash=hash(req,code);
  const {error}=await adminDb.rpc('issue_email_challenge',{p_user:req.user.id,p_session:req.user.session_id,p_hash:codeHash});
  if(error){if(error.code==='P0001')return res.status(429).json({error:'Wait 60 seconds before requesting another code.'});throw error;}
  try{await sendLoginCode(req.user.email,code);}catch(e){await adminDb.from('email_login_challenges').delete().eq('session_id',req.user.session_id).eq('code_hash',codeHash);throw e;}
  res.json({sent:true,expiresIn:600,resendAfter:60});
 }catch(e){next(e);}
});
router.post('/otp/verify',rateLimit({windowMs:15*60*1000,limit:40,keyGenerator:req=>req.user.id,standardHeaders:'draft-8',legacyHeaders:false}),async(req,res,next)=>{
 try{
  const {code}=z.object({code:z.string().regex(/^[0-9]{6}$/,'Enter the 6 digit code from your email.')}).parse(req.body);
  const {data,error}=await adminDb.rpc('verify_email_challenge',{p_user:req.user.id,p_session:req.user.session_id,p_hash:hash(req,code)});if(error)throw error;
  if(!data?.verified)return res.status(422).json({error:data?.error||'The code is incorrect or expired.'});
  res.json({verified:true});
 }catch(e){next(e);}
});
router.post('/logout',async(req,res,next)=>{try{
 for(const table of ['login_verifications','email_login_challenges']){const {error}=await adminDb.from(table).delete().eq('session_id',req.user.session_id).eq('user_id',req.user.id);if(error)throw error;}
 res.json({ok:true});
}catch(e){next(e);}});
export default router;
