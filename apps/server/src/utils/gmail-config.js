import {z} from 'zod';

export const googleAppPasswordSchema=z.string().trim().max(128)
 .refine(value=>!/[\r\n]/.test(value),'Use a single line.')
 .transform(value=>value.replace(/[ \t]/g,''))
 .refine(value=>value===''||/^[A-Za-z0-9]{16}$/.test(value),'Enter the 16-character Google App Password.');

export const gmailDeliveryMethod=value=>value.delivery_method??'oauth';

export const appsScriptUrlSchema=z.string().trim().max(1000)
 .refine(value=>value===''||/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,300}\/exec$/.test(value),'Use the deployed Apps Script web app URL ending in /exec.');
export const appsScriptSecretSchema=z.string().trim().max(128)
 .refine(value=>value===''||/^[A-Za-z0-9_-]{32,128}$/.test(value),'Use a random Apps Script signing key of at least 32 characters.');
