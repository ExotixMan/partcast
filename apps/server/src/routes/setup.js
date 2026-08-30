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

router.post('/bootstrap', async (req, res, next) => {
  try {
    const body = z.object({
      setupSecret: z.string().min(16),
      fullName: z.string().trim().min(2).max(120),
      email: z.string().email(),
      password: z.string().min(10).max(128)
    }).parse(req.body);

    if (body.setupSecret !== config.SETUP_SECRET) return res.status(401).json({ error: 'Invalid setup secret.' });
    const { count } = await adminDb.from('profiles').select('*', { count: 'exact', head: true });
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
      role: 'owner',
      active: true
    }).eq('id', data.user.id);
    if (updateError) throw updateError;

    res.status(201).json({ message: 'Owner account created. You can now sign in.' });
  } catch (e) { next(e); }
});

export default router;
