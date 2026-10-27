function authorizePartCast() {
  return {sender: Session.getEffectiveUser().getEmail(), remaining: MailApp.getRemainingDailyQuota()};
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({service: 'PartCast email relay', message: 'Send a signed request from the PartCast API.'})).setMimeType(ContentService.MimeType.JSON);
}

function doPost(event) {
  function result(value) {
    return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
  }
  let lock;
  try {
    const properties = PropertiesService.getScriptProperties();
    const secret = properties.getProperty('PARTCAST_MAIL_SECRET') || '';
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(secret)) return result({ok: false, error: 'NOT_CONFIGURED'});
    const raw = event && event.postData && event.postData.contents;
    if (typeof raw !== 'string' || raw.length > 410000) return result({ok: false, error: 'INVALID_REQUEST'});
    let envelope;
    try { envelope = JSON.parse(raw); } catch (_) { return result({ok: false, error: 'INVALID_REQUEST'}); }
    if (typeof envelope.payload !== 'string' || !/^[A-Za-z0-9_-]{1,400000}$/.test(envelope.payload) || typeof envelope.signature !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(envelope.signature)) return result({ok: false, error: 'AUTH_FAILED'});
    const expected = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(envelope.payload, secret, Utilities.Charset.UTF_8)).replace(/=+$/, '');
    let different = expected.length ^ envelope.signature.length;
    for (let i = 0; i < expected.length; i++) different |= expected.charCodeAt(i) ^ envelope.signature.charCodeAt(i);
    if (different) return result({ok: false, error: 'AUTH_FAILED'});
    let request;
    try { request = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(envelope.payload)).getDataAsString('UTF-8')); } catch (_) { return result({ok: false, error: 'INVALID_REQUEST'}); }
    const now = Date.now();
    if (request.version !== 1 || !['check', 'send'].includes(request.action) || !Number.isSafeInteger(request.issued_at) || Math.abs(now - request.issued_at) > 300000 || typeof request.request_id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(request.request_id)) return result({ok: false, error: 'INVALID_REQUEST'});
    const sender = Session.getEffectiveUser().getEmail();
    if (typeof request.sender_email !== 'string' || !sender || request.sender_email.toLowerCase() !== sender.toLowerCase()) return result({ok: false, error: 'SENDER_MISMATCH'});
    if (request.action === 'check') return result({ok: true, request_id: request.request_id, remaining: MailApp.getRemainingDailyQuota()});
    const mail = request.message;
    if (!mail || typeof mail.to !== 'string' || mail.to.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(mail.to) || typeof mail.subject !== 'string' || mail.subject.length < 2 || mail.subject.length > 180 || /[\r\n]/.test(mail.subject) || (mail.text !== undefined && (typeof mail.text !== 'string' || mail.text.length > 100000)) || (mail.html !== undefined && (typeof mail.html !== 'string' || mail.html.length > 200000)) || (!mail.text && !mail.html)) return result({ok: false, error: 'INVALID_REQUEST'});
    lock = LockService.getScriptLock();
    if (!lock.tryLock(1000)) return result({ok: false, error: 'BUSY'});
    const key = 'partcast_mail_' + request.request_id;
    const saved = properties.getProperty(key);
    if (saved) {
      const previous = JSON.parse(saved);
      if (previous.signature !== envelope.signature) return result({ok: false, error: 'INVALID_REQUEST'});
      return result(previous.state === 'sent' ? {ok: true, request_id: request.request_id, sent: true} : {ok: false, error: 'UNCONFIRMED'});
    }
    if (MailApp.getRemainingDailyQuota() < 1) return result({ok: false, error: 'QUOTA_EXCEEDED'});
    const all = properties.getProperties();
    let count = 0;
    for (const name of Object.keys(all)) {
      if (!name.startsWith('partcast_mail_')) continue;
      const record = JSON.parse(all[name]);
      if (now - record.at > 172800000) properties.deleteProperty(name);
      else count++;
    }
    if (count >= 500) return result({ok: false, error: 'BUSY'});
    properties.setProperty(key, JSON.stringify({state: 'pending', at: now, signature: envelope.signature}));
    const options = {to: mail.to, subject: mail.subject, body: mail.text || '', name: 'NPG Auto Parts · PartCast'};
    if (mail.html) options.htmlBody = mail.html;
    MailApp.sendEmail(options);
    properties.setProperty(key, JSON.stringify({state: 'sent', at: now, signature: envelope.signature}));
    return result({ok: true, request_id: request.request_id, sent: true});
  } catch (_) {
    return result({ok: false, error: 'UNCONFIRMED'});
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}
