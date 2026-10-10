import {Router} from 'express';
import {z} from 'zod';
import multer from 'multer';
import {normalizeProductPhoto} from '../utils/productPhotos.js';
import crypto from 'node:crypto';
import {adminDb,userDb} from '../supabase.js';
import {requireRole} from '../middleware/auth.js';
import {audit} from '../utils/audit.js';
import {fetchAll} from '../utils/helpers.js';
import {batchSchema,debtSchema,paymentSchema} from '../utils/storeValidation.js';
const router=Router(),write=requireRole('owner','admin','inventory_staff');
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1}});
for(const [path,schema] of [['/inventory/batch',batchSchema],['/debts',debtSchema],['/debts/payment',paymentSchema]]){
 router.post(path,write,async(req,res,next)=>{try{
 const {client_operation_id,...payload}=schema.parse(req.body);
 const {data,error}=await userDb(req.user.accessToken).rpc('sync_store_operation',{p_operation_id:client_operation_id,p_payload:payload});
 if(error)throw error;
 await audit(req,payload.kind,'store_operation',client_operation_id,{kind:payload.kind}).catch(()=>console.error('Store operation audit failed.'));
 res.status(201).json(data);
 }catch(e){next(e);}});
}
router.get('/debts',async(req,res,next)=>{try{
 const data=await fetchAll(()=>adminDb.from('customer_balances').select('*').order('occurred_at',{ascending:false}));
 res.json({data,savedAt:new Date().toISOString()});
}catch(e){next(e);}});
router.get('/debts/:id/payments',async(req,res,next)=>{try{
 const id=z.string().uuid().parse(req.params.id);
 const {data,error}=await adminDb.from('debt_payments').select('*').eq('debt_id',id).order('paid_at',{ascending:false});if(error)throw error;res.json({data});
}catch(e){next(e);}});
router.get('/barcode/:code',async(req,res,next)=>{try{
 const code=z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9 ._/-]+$/).parse(req.params.code);
 const {data,error}=await adminDb.from('inventory_status').select('*').eq('active',true).ilike('barcode',code.replace(/_/g,'\\_')).maybeSingle();
 if(error)throw error;res.json({product:data});
}catch(e){next(e);}});
const photoParams=req=>({id:z.string().uuid().parse(req.params.id),file:z.string().regex(/^[0-9a-f-]{36}\.webp$/).parse(req.params.file)});
router.get('/photos/:id/:file',async(req,res,next)=>{try{
 const {id,file}=photoParams(req),path=`${id}/${file}`;
 const {data:product,error}=await adminDb.from('products').select('photo_paths').eq('id',id).eq('active',true).single();if(error)throw error;
 if(!product.photo_paths.includes(path))return res.status(404).json({error:'Photo not found.'});
 const {data,error:downloadError}=await adminDb.storage.from('partcast-photos').download(path);if(downloadError)throw downloadError;
 res.type('image/webp').set('X-Content-Type-Options','nosniff').send(Buffer.from(await data.arrayBuffer()));
}catch(e){next(e);}});
router.post('/photos/:id',write,upload.single('file'),async(req,res,next)=>{try{
 const id=z.string().uuid().parse(req.params.id);
 if(!req.file||!['image/jpeg','image/png','image/webp'].includes(req.file.mimetype))return res.status(422).json({error:'Choose a JPEG, PNG, or WebP photo under 5 MB.'});
 const image=await normalizeProductPhoto(req.file.buffer,req.file.mimetype);
 const path=`${id}/${crypto.randomUUID()}.webp`;
 const {error}=await adminDb.storage.from('partcast-photos').upload(path,image,{contentType:'image/webp',upsert:false});if(error)throw error;
 const {data,error:metaError}=await adminDb.rpc('change_product_photo',{p_id:id,p_path:path,p_remove:false});
 if(metaError){await adminDb.storage.from('partcast-photos').remove([path]);throw metaError;}
 res.status(201).json({photo_paths:data});
}catch(e){next(e);}});
router.delete('/photos/:id/:file',write,async(req,res,next)=>{try{
 const {id,file}=photoParams(req),path=`${id}/${file}`;
 const {data,error}=await adminDb.rpc('change_product_photo',{p_id:id,p_path:path,p_remove:true});if(error)throw error;
 const {error:storageError}=await adminDb.storage.from('partcast-photos').remove([path]);if(storageError)console.error('Unused photo cleanup failed.');
 res.json({photo_paths:data});
}catch(e){next(e);}});
export default router;
