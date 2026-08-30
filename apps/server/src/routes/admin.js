import { Router } from 'express';
import { z } from 'zod';
import { adminDb } from '../supabase.js';
import { requireRole } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { sendSupplierEmail, recommendationHash } from '../utils/email.js';
import { createBackup } from './jobs.js';

const router=Router();
router.use(requireRole('owner','admin'));

router.get('/users', async(req,res,next)=>{
  try{
    const {data,error}=await adminDb.from('profiles').select('*').order('created_at');
    if(error) throw error;
    const users=[];
    for(const profile of data||[]){
      const auth=await adminDb.auth.admin.getUserById(profile.id);
      users.push({...profile,email:auth.data?.user?.email||null,last_sign_in_at:auth.data?.user?.last_sign_in_at||null});
    }
    res.json({data:users});
  }catch(e){next(e);}
});

router.post('/users', requireRole('owner'), async(req,res,next)=>{
  try{
    const body=z.object({fullName:z.string().trim().min(2).max(120),email:z.string().email(),password:z.string().min(10).max(128),role:z.enum(['owner','admin','inventory_staff'])}).parse(req.body);
    const {data,error}=await adminDb.auth.admin.createUser({email:body.email,password:body.password,email_confirm:true,user_metadata:{full_name:body.fullName}});
    if(error) throw error;
    const upd=await adminDb.from('profiles').update({full_name:body.fullName,role:body.role,active:true}).eq('id',data.user.id);
    if(upd.error) throw upd.error;
    await audit(req,'create','user',data.user.id,{role:body.role});
    res.status(201).json({id:data.user.id});
  }catch(e){next(e);}
});

router.patch('/users/:id', requireRole('owner'), async(req,res,next)=>{
  try{
    const body=z.object({full_name:z.string().trim().min(2).max(120).optional(),role:z.enum(['owner','admin','inventory_staff']).optional(),active:z.boolean().optional()}).parse(req.body);
    const {data:target,error:targetError}=await adminDb.from('profiles').select('id,role,active').eq('id',req.params.id).single();
    if(targetError) throw targetError;

    if(req.params.id===req.user.id){
      if(body.active===false) return res.status(400).json({error:'You cannot deactivate your own account.'});
      if(body.role && body.role!=='owner') return res.status(400).json({error:'You cannot remove your own owner role.'});
    }

    const removesActiveOwner = target.role==='owner' && target.active && (body.active===false || (body.role && body.role!=='owner'));
    if(removesActiveOwner){
      const {count,error:countError}=await adminDb.from('profiles').select('*',{count:'exact',head:true}).eq('role','owner').eq('active',true);
      if(countError) throw countError;
      if((count||0)<=1) return res.status(400).json({error:'At least one active owner account is required.'});
    }

    const {data,error}=await adminDb.from('profiles').update(body).eq('id',req.params.id).select('*').single();
    if(error) throw error;
    await audit(req,'update','user',req.params.id,{fields:Object.keys(body)});
    res.json({user:data});
  }catch(e){next(e);}
});


router.get('/system-status', async(req,res)=>{
  res.json({
    emailConfigured:Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL),
    backupBucket:'partcast-backups',
    modelBucket:'partcast-models',
    environment:process.env.NODE_ENV||'development'
  });
});

router.get('/settings', async(req,res,next)=>{
  try{const {data,error}=await adminDb.from('system_settings').select('*').order('key');if(error)throw error;res.json({data});}catch(e){next(e);}
});

router.patch('/settings/:key', requireRole('owner'), async(req,res,next)=>{
  try{
    const key=z.enum(['forecast_horizon_days','auto_supplier_email_enabled','supplier_email_cooldown_days','backup_retention_days','include_legacy_proxy_by_default']).parse(req.params.key);
    let value;
    if(key==='auto_supplier_email_enabled' || key==='include_legacy_proxy_by_default') value=z.boolean().parse(req.body?.value);
    else if(key==='forecast_horizon_days') value=z.coerce.number().int().min(7).max(90).parse(req.body?.value);
    else if(key==='supplier_email_cooldown_days') value=z.coerce.number().int().min(1).max(30).parse(req.body?.value);
    else value=z.coerce.number().int().min(1).max(365).parse(req.body?.value);
    const {data,error}=await adminDb.from('system_settings').upsert({key,value,updated_by:req.user.id,updated_at:new Date().toISOString()},{onConflict:'key'}).select('*').single();
    if(error)throw error;
    await audit(req,'update','setting',key,{value});
    res.json({data});
  }catch(e){next(e);}
});

router.post('/supplier-email/:supplierId', async(req,res,next)=>{
  try{
    const {data:items,error}=await adminDb.from('reorder_recommendations').select('*').eq('supplier_id',req.params.supplierId).gt('recommended_quantity',0);
    if(error)throw error;
    if(!items?.length)return res.status(422).json({error:'No replenishment items for this supplier.'});
    const supplier={id:req.params.supplierId,name:items[0].supplier_name,email:items[0].supplier_email};
    if(!supplier.email)return res.status(422).json({error:'This supplier has no email address.'});
    const provider=await sendSupplierEmail({supplier,items});
    const hash=recommendationHash(items);
    await adminDb.from('supplier_email_logs').insert({supplier_id:supplier.id,recipient_email:supplier.email,subject:'NPG Autoparts replenishment request',recommendation_hash:hash,item_count:items.length,status:'sent',provider_message_id:provider.messageId||null,sent_by:req.user.id});
    await audit(req,'send_email','supplier',supplier.id,{items:items.length});
    res.json({message:'Supplier email sent.',items:items.length});
  }catch(e){next(e);}
});

router.get('/email-logs', async(req,res,next)=>{
  try{const {data,error}=await adminDb.from('supplier_email_logs').select('*,supplier:suppliers(name)').order('sent_at',{ascending:false}).limit(100);if(error)throw error;res.json({data});}catch(e){next(e);}
});

router.post('/backups', async(req,res,next)=>{
  try{const backup=await createBackup(req.user.id);await audit(req,'create','backup',backup.id,{file:backup.file_name});res.json({backup});}catch(e){next(e);}
});

router.get('/backups', async(req,res,next)=>{
  try{const {data,error}=await adminDb.from('backup_logs').select('*').order('created_at',{ascending:false}).limit(100);if(error)throw error;res.json({data});}catch(e){next(e);}
});

router.get('/backups/:id/download', async(req,res,next)=>{
  try{
    const {data:log,error}=await adminDb.from('backup_logs').select('*').eq('id',req.params.id).single();if(error)throw error;
    const signed=await adminDb.storage.from('partcast-backups').createSignedUrl(log.storage_path,300);
    if(signed.error)throw signed.error;
    res.json({url:signed.data.signedUrl,expiresIn:300});
  }catch(e){next(e);}
});

router.get('/audit', async(req,res,next)=>{
  try{const {data,error}=await adminDb.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(200);if(error)throw error;res.json({data});}catch(e){next(e);}
});

export default router;
