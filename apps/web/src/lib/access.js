export const staffRoles = ['super_admin', 'owner', 'admin', 'inventory_staff'];
export const managerRoles = ['super_admin', 'owner', 'admin'];
export const ownerRoles = ['super_admin', 'owner'];
export const roleLabels = {super_admin:'Super Admin',owner:'Owner',admin:'Admin',inventory_staff:'Inventory staff',cashier:'Cashier'};
export const homeForRole = role => role === 'cashier' ? '/counter' : '/';
export function canOpenPage(role, path) {
  if (!role) return false;
  if (path === '/it-settings') return role === 'super_admin';
  if (['/settings','/users'].includes(path)) return ownerRoles.includes(role);
  if (['/imports','/backups'].includes(path)) return managerRoles.includes(role);
  return role !== 'cashier' || ['/inventory','/counter','/account'].includes(path);
}
export function sessionId(session) {
  try {
    const encoded = session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    const claims = JSON.parse(atob(encoded));
    return claims.amr?.some(a => a.method === 'password') ? claims.session_id : null;
  } catch { return null; }
}
// An offline profile is usable only by the password session that passed its email check.
export const verifiedCacheMatches = (session, user) => Boolean(user?.active && Date.parse(user.verification_expires_at)>Date.now() && user.id === session?.user?.id && sessionId(session) && user.session_id === sessionId(session));
