export function cleanText(value, max = 500) {
  if (value === null || value === undefined) return null;
  return String(value).trim().slice(0, max) || null;
}

export function numberOr(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function excelDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && value > 20000 && value < 90000) {
    const millis = Math.round((value - 25569) * 86400 * 1000);
    return new Date(millis).toISOString().slice(0, 10);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export async function fetchAll(builderFactory, chunkSize = 1000) {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await builderFactory().range(from, from + chunkSize - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < chunkSize) break;
    from += chunkSize;
  }
  return all;
}
