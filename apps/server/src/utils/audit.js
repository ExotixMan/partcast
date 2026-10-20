import crypto from 'node:crypto';
import { adminDb } from '../supabase.js';
import { config } from '../config.js';

function ipHash(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  return crypto.createHmac('sha256', config.IP_HASH_SECRET).update(ip).digest('hex');
}

export async function audit(req, action, entityType, entityId = null, metadata = {}) {
  try {
    const {error}=await adminDb.from('audit_logs').insert({
      actor_id: req.user?.id || null,
      action,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : null,
      metadata,
      ip_hash: ipHash(req)
    });
    if(error)console.error('Audit log could not be saved.');
  } catch {
    console.error('Audit log could not be saved.');
  }
}
