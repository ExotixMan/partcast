import { ZodError } from 'zod';

export function notFound(req, res) {
  res.status(404).json({ error: 'Endpoint not found.' });
}

export function errorHandler(err, req, res, next) {
  console.error(err?.stack || err);
  if (res.headersSent) return next(err);

  if (err instanceof ZodError) {
    const first = err.issues?.[0];
    const field = first?.path?.length ? `${first.path.join('.')}: ` : '';
    return res.status(400).json({ error: `${field}${first?.message || 'Invalid request data.'}` });
  }

  if (err?.code === '23505') return res.status(409).json({ error: 'A record with the same unique value already exists.' });
  if (err?.code === '23503') return res.status(409).json({ error: 'This record is still referenced by another record.' });
  if (err?.code === '23514' || err?.code === '22P02') return res.status(422).json({ error: 'The supplied value is not valid for this operation.' });

  const status =
    Number(err?.status) || 500;

  console.error('PARTCAST ERROR:', {
    message: err?.message,
    code: err?.code,
    details: err?.details,
    hint: err?.hint,
    stack: err?.stack
  });

  const isDevelopment =
    process.env.NODE_ENV !== 'production';

  const message =
    status >= 500 && !isDevelopment
      ? 'The server could not complete the request.'
      : err?.message ||
        'Unknown server error.';

  res.status(status).json({
    error: message
});
  res.status(status).json({ error: message });
}
