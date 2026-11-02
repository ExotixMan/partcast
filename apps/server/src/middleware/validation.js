import {z} from 'zod';

export function validateJsonBody(req,res,next){
  if(req.body===undefined)return next();
  const pending=[{value:req.body,depth:0}];
  let visited=0;
  while(pending.length){
    const {value,depth}=pending.pop();
    if(++visited>10000||depth>20)return res.status(422).json({error:'This request is too complex. Submit fewer items at a time.'});
    if(typeof value==='string'&&/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))return res.status(422).json({error:'Remove unsupported control characters from the text and try again.'});
    if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){
      if(/[\u0000-\u001f\u007f]/.test(key))return res.status(422).json({error:'The request contains an invalid field name.'});
      pending.push({value:item,depth:depth+1});
    }
  }
  next();
}

export function uuidParam(req,res,next,id){
  if(!z.string().uuid().safeParse(id).success)return res.status(400).json({error:'Choose a valid saved record.'});
  next();
}

export const settingsInteger=(min,max)=>z.preprocess(value=>
  typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value.trim())?value:NaN,
  z.coerce.number().finite().int().min(min).max(max));
