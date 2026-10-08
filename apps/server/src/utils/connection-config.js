export function supabaseKeyIssue(url, key, expectedRole) {
  if (key?.startsWith('sb_secret_') && expectedRole === 'anon') return 'Use the public Supabase key for this setting.';
  if (!key || key.split('.').length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    if (claims.role && claims.role !== expectedRole) return `Use the Supabase ${expectedRole === 'anon' ? 'public' : 'service role'} key for this setting.`;
    const hostname = new URL(url).hostname;
    if (claims.ref && hostname.endsWith('.supabase.co') && claims.ref !== hostname.split('.')[0]) return 'This key belongs to another Supabase project. Use a key from the project configured in SUPABASE_URL.';
    return null;
  } catch { return 'The Supabase key is not a valid JWT. Copy it again from the project settings.'; }
}

export function frontendOrigins(value) {
  return [...new Set(value.split(',').map(origin => {
    const url = new URL(origin.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Use HTTP or HTTPS website addresses in FRONTEND_ORIGINS.');
    return url.origin;
  }))];
}
