import { adminDb } from '../supabase.js';

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required.' });

    const { data: userData, error: userError } = await adminDb.auth.getUser(token);
    if (userError || !userData.user) return res.status(401).json({ error: 'Invalid or expired session.' });

    const { data: profile, error: profileError } = await adminDb
      .from('profiles')
      .select('id,full_name,role,active')
      .eq('id', userData.user.id)
      .single();

    if (profileError || !profile?.active) return res.status(403).json({ error: 'Account is inactive or not provisioned.' });

    req.user = { ...profile, email: userData.user.email, accessToken: token };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

export function cronAuth(req, res, next) {
  const secret = req.headers['x-cron-secret'];
  if (!secret || secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Invalid job secret.' });
  next();
}
