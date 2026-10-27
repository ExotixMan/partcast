import nodemailer from 'nodemailer';
import {googleAppPasswordSchema} from './gmail-config.js';

function smtpError(error,source,sending){
 const responseCode=Number.isInteger(error?.responseCode)?error.responseCode:null;
 const command=String(error?.command||'').toUpperCase();
 const authentication=error?.code==='EAUTH'||command.startsWith('AUTH');
 const beforeData=authentication||['EENVELOPE','EDNS','ENOTFOUND','ECONNREFUSED'].includes(error?.code)||['EHLO','HELO','STARTTLS','MAIL FROM','RCPT TO'].includes(command);
 const rejected=responseCode!==null&&responseCode>=400&&responseCode<600;
 const uncertain=sending&&!beforeData&&!rejected;
 const code=authentication?'GMAIL_SMTP_AUTH_FAILED':uncertain?'GMAIL_SMTP_UNCONFIRMED':rejected?'GMAIL_SMTP_REJECTED':'GMAIL_SMTP_UNAVAILABLE';
 const message=authentication
  ?'Gmail rejected the SMTP sign-in. Check the sending address and Google App Password.'
  :uncertain?'Gmail delivery could not be confirmed. Check Gmail Sent before sending another request.'
  :rejected?'Gmail refused this email request. Check the recipient and the sending account’s limits.'
  :'The server could not connect to Gmail SMTP. Render Free blocks SMTP; use hosting that allows port 465.';
 return Object.assign(new Error(message),{status:503,safe:true,code,deliveryUncertain:uncertain,
  details:{provider:'gmail',stage:authentication?'smtp_auth':uncertain?'smtp_send':'smtp_connection',settings_source:source,smtp_response_code:responseCode}});
}

function transport(value){
 const password=googleAppPasswordSchema.safeParse(value.app_password||'');
 if(!value.sender_email||!password.success||!password.data)throw Object.assign(new Error('Enter the sending Gmail address and its 16-character Google App Password.'),{status:422,safe:true,code:'GMAIL_SMTP_NOT_CONFIGURED',deliveryUncertain:false});
 return nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,forceAuth:true,
  auth:{user:value.sender_email,pass:password.data},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true,servername:'smtp.gmail.com'},
  connectionTimeout:6000,greetingTimeout:5000,socketTimeout:6000,dnsTimeout:3000,
  disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false});
}

export async function verifyGmailSmtp(value,source='saved_partcast_settings'){
 const client=transport(value);
 try{
  if(await client.verify()!==true)throw new Error('SMTP verification was not acknowledged');
 }catch(error){throw smtpError(error,source,false);}
 finally{client.close();}
}

export async function sendGmailSmtp(value,{to,subject,text,html},source){
 const client=transport(value);
 try{
  const result=await client.sendMail({from:value.sender_email,to,subject,text,html,envelope:{from:value.sender_email,to:[to]},disableFileAccess:true,disableUrlAccess:true});
  const accepted=result?.accepted?.some(address=>typeof address==='string'&&address.toLowerCase()===to.toLowerCase());
  if(!accepted||!/^250\b/.test(result?.response||''))throw new Error('SMTP delivery was not acknowledged');
  return {messageId:result.messageId||null};
 }catch(error){throw smtpError(error,source,true);}
 finally{client.close();}
}
