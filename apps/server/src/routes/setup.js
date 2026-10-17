import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { Router } from 'express';
import { z } from 'zod';
import { adminDb } from '../supabase.js';
import { config } from '../config.js';

const router = Router();

router.get('/status', async (req, res, next) => {
  try {
    const { count, error } = await adminDb.from('profiles').select('*', { count: 'exact', head: true });
    if (error) throw error;
    res.json({ needsSetup: (count || 0) === 0 });
  } catch (e) { next(e); }
});

router.post('/bootstrap', rateLimit({windowMs:15*60*1000,limit:5}), async (req, res, next) => {
  const leaseToken=crypto.randomUUID();
  let leased=false;
  try {
    const body = z.object({
      setupSecret: z.string().min(16),
      fullName: z.string().trim().min(2).max(120),
      email: z.string().email(),
      password: z.string().min(10).max(128)
    }).parse(req.body);

    if (Buffer.byteLength(body.setupSecret) !== Buffer.byteLength(config.SETUP_SECRET) || !crypto.timingSafeEqual(Buffer.from(body.setupSecret),Buffer.from(config.SETUP_SECRET))) return res.status(401).json({ error: 'Invalid setup secret.' });
    const claim=await adminDb.rpc('claim_job',{p_name:'owner-bootstrap',p_token:leaseToken,p_seconds:600});
    if(claim.error)throw claim.error;
    if(!claim.data)return res.status(409).json({error:'Owner setup is already in progress. Please wait.'});
    leased=true;
    const { count, error: countError } = await adminDb.from('profiles').select('*', { count: 'exact', head: true });
    if(countError)throw countError;
    if ((count || 0) > 0) return res.status(409).json({ error: 'Initial setup is already complete.' });

    const { data, error } = await adminDb.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.fullName }
    });
    if (error) throw error;

    const { error: updateError } = await adminDb.from('profiles').update({
      full_name: body.fullName,
      role: 'super_admin',
      active: true
    }).eq('id', data.user.id);
    if (updateError) {await adminDb.auth.admin.deleteUser(data.user.id);throw updateError;}

    res.status(201).json({ message: 'Super Admin account created. You can now sign in.' });
  } catch (e) { next(e); }
  finally {if(leased){const result=await adminDb.rpc('release_job',{p_name:'owner-bootstrap',p_token:leaseToken});if(result.error)console.error('Owner setup lease release failed.');}}
});

export default router;
