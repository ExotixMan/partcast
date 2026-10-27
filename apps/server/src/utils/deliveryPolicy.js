import {isDeepStrictEqual} from 'node:util';
import {adminDb} from '../supabase.js';

export const MAX_DELIVERY_QUANTITY=2;
export async function enforceDeliveryLimit(userId,operationId,payload){
 if(payload.kind!=='batch'||payload.tx_type!=='stock_in'||payload.lines.every(line=>Number.isInteger(line.quantity)&&line.quantity>=1&&line.quantity<=MAX_DELIVERY_QUANTITY))return null;
 const {data,error}=await adminDb.from('business_sync_receipts').select('payload,result').eq('user_id',userId).eq('operation_id',operationId).maybeSingle();
 if(error)throw error;
 if(data&&isDeepStrictEqual(data.payload,payload))return data;
 throw Object.assign(new Error('Receive a maximum of 2 units per item.'),{status:422,safe:true});
}
