import crypto from 'node:crypto';
import {config} from '../config.js';

const failure = (message, status, code) => Object.assign(new Error(message),{status,code,safe:true});
export const recaptchaEnabled = () => Boolean(config.RECAPTCHA_SITE_KEY && config.RECAPTCHA_SECRET_KEY);
export const publicRecaptcha = () => recaptchaEnabled() ? {siteKey:config.RECAPTCHA_SITE_KEY} : null;

export async function verifyRecaptcha(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,4096}$/.test(token)) throw failure('Complete the security check before continuing.',422,'CAPTCHA_REQUIRED');
  let response, result;
  try {
    response = await fetch('https://www.google.com/recaptcha/api/siteverify',{
      method:'POST',body:new URLSearchParams({secret:config.RECAPTCHA_SECRET_KEY,response:token}),
      signal:AbortSignal.timeout(10000),redirect:'error'
    });
    if (!response.ok) throw new Error();
    result = await response.json();
  } catch {
    throw failure('Security check is temporarily unavailable. Please try again.',503,'CAPTCHA_UNAVAILABLE');
  }
  const hosts = config.frontendOrigins.map(origin => new URL(origin).hostname);
  if (result.success !== true || !hosts.includes(result.hostname))
    throw failure('Security check was not accepted. Please try the check again.',422,'CAPTCHA_FAILED');
}

function signature(payload) {
  return crypto.createHmac('sha256',config.IP_HASH_SECRET).update(`partcast-recaptcha:${payload}`).digest();
}
export function createBotProof(userId, sessionId) {
  const expiresAt = Date.now() + 10*60*1000;
  const payload = Buffer.from(JSON.stringify({userId,sessionId,expiresAt})).toString('base64url');
  return {token:`${payload}.${signature(payload).toString('base64url')}`,expiresAt};
}
export function validBotProof(token, userId, sessionId) {
  if (typeof token !== 'string' || token.length > 2048) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const supplied = Buffer.from(parts[1],'base64url'), expected = signature(parts[0]);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied,expected)) return false;
    const proof = JSON.parse(Buffer.from(parts[0],'base64url'));
    return proof.userId === userId && proof.sessionId === sessionId && proof.expiresAt > Date.now() && proof.expiresAt <= Date.now()+10*60*1000;
  } catch { return false; }
}
