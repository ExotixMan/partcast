import {z} from 'zod';

export const googleAppPasswordSchema=z.string().trim().max(128)
 .refine(value=>!/[\r\n]/.test(value),'Use a single line.')
 .transform(value=>value.replace(/[ \t]/g,''))
 .refine(value=>value===''||/^[A-Za-z0-9]{16}$/.test(value),'Enter the 16-character Google App Password.');

export const gmailDeliveryMethod=value=>value.delivery_method??'oauth';
