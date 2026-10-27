import { ZodError } from 'zod';
import {validationMessage} from '../utils/validationMessage.js';

function gmailDiagnostics(error){
  if(!error?.safe||!/^GMAIL_[A-Z_]+$/.test(error.code||'')||error.details?.provider!=='gmail')return;
  const detail=error.details,result={provider:'gmail'};
  const allowed={
    stage:['oauth_token','gmail_api_send','smtp_auth','smtp_connection','smtp_send'],
    settings_source:['api_environment','saved_partcast_settings','submitted_partcast_settings'],
    smtp_error_code:['EAUTH','ETIMEDOUT','ECONNREFUSED','ECONNRESET','ESOCKET','EDNS','ENOTFOUND','ETLS','EENVELOPE','EMESSAGE','ECONNECTION','EPROTOCOL'],
    smtp_command:['AUTH','CONN','EHLO','HELO','STARTTLS','MAIL FROM','RCPT TO','DATA'],
    google_error:['invalid_client','invalid_grant','unauthorized_client','access_denied','invalid_scope','invalid_request','unsupported_grant_type']
  };
  for(const [key,values] of Object.entries(allowed))if(values.includes(detail[key]))result[key]=detail[key];
  for(const key of ['smtp_response_code','http_status'])if(Number.isInteger(detail[key])&&detail[key]>=100&&detail[key]<=599)result[key]=detail[key];
  return result;
}

export function notFound(req, res) {
  res.status(404).json({ error: 'Endpoint not found.' });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ZodError) {
    const first = err.issues?.[0];
    return res.status(400).json({ error: validationMessage(first) });
  }
  if(err?.type==='entity.parse.failed')return res.status(400).json({error:'The request could not be read. Please try again.'});

  if (err?.code === 'SIMULATED_DEMAND') return res.status(422).json({error:err.message,code:'SIMULATED_DEMAND'});

  if (err?.code === '23505') return res.status(409).json({ error: 'A record with the same unique value already exists.' });
  if (err?.code === '23503') return res.status(409).json({ error: 'This record is still referenced by another record.' });
  if (err?.code === '23514' || err?.code === '22P02') return res.status(422).json({ error: 'The supplied value is not valid for this operation.' });

  if (err?.code === 'P0001' && /Insufficient stock|Product not found/.test(err.message)) return res.status(409).json({error:err.message});
  if (err?.code === '22023') return res.status(422).json({error:err.message || 'Review the saved change.'});
  if(err?.code==='LIMIT_FILE_SIZE')return res.status(413).json({error:'The file is too large. Product photos must be under 5 MB; spreadsheets under 25 MB.'});
  if (err?.code === '42501') return res.status(403).json({error:'This account is not allowed to make this change.'});
  if(['PGRST202','PGRST204','42703'].includes(err?.code)&&/save_product_supplier|client_request_id|request_hash/.test(err.message||''))return res.status(503).json({error:'Restock setup is incomplete. Ask the Super Admin to apply migration 0011_restock_workflows.sql, then refresh the page.'});

  const status =
    Number(err?.status) || 500;
  const diagnostics=gmailDiagnostics(err);

  if(status>=500)console.error('PARTCAST ERROR:', {
    message: err?.message,
    code: err?.code,
    details: err?.safe&&/^GMAIL_[A-Z_]+$/.test(err?.code||'')?diagnostics:err?.details,
    hint: err?.hint,
    stack: err?.stack
  });

  const isDevelopment =
    process.env.NODE_ENV !== 'production';

  const message =
    status >= 500 && !isDevelopment && !err?.safe
      ? 'The server could not complete the request.'
      : err?.message ||
        'Unknown server error.';

  res.status(status).json({
    error: message,
    ...(diagnostics?{diagnostics}:{}),
    ...(err?.safe&&/^(GMAIL_|SUPPLIER_EMAIL_)[A-Z_]+$/.test(err?.code||'')?{code:err.code}:{})
});
}
