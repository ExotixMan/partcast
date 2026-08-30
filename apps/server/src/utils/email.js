import crypto from 'node:crypto';
import { config } from '../config.js';
import { escapeHtml } from './helpers.js';

export function recommendationHash(items) {
  const normalized = items
    .map(i => `${i.product_id}:${Number(i.recommended_quantity).toFixed(2)}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export async function sendSupplierEmail({ supplier, items }) {
  if (!config.BREVO_API_KEY || !config.BREVO_SENDER_EMAIL) {
    const error = new Error('Brevo email is not configured. Add BREVO_API_KEY and BREVO_SENDER_EMAIL.');
    error.status = 503;
    throw error;
  }

  const rows = items.map(item => `
    <tr>
      <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(item.part_number || 'N/A')}</td>
      <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(item.description)}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;text-align:right">${Number(item.current_stock).toFixed(0)}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;text-align:right">${Math.ceil(Number(item.recommended_quantity))}</td>
    </tr>`).join('');

  const htmlContent = `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
      <h2>NPG Autoparts Supply Request</h2>
      <p>Hello ${escapeHtml(supplier.contact_person || supplier.name)},</p>
      <p>PartCast identified the following items for replenishment based on current stock thresholds and, when available, the latest demand forecast. Please confirm availability, price, and expected delivery schedule.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <thead><tr>
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Part No.</th>
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Description</th>
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:right">On Hand</th>
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:right">Needed</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p>This is an automated inventory replenishment request from NPG Autoparts. A staff member will review your reply before a purchase is finalized.</p>
    </div>`;

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': config.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      sender: { name: config.BREVO_SENDER_NAME, email: config.BREVO_SENDER_EMAIL },
      to: [{ email: supplier.email, name: supplier.name }],
      subject: `NPG Autoparts - Replenishment request (${items.length} item${items.length === 1 ? '' : 's'})`,
      htmlContent
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `Email provider returned ${response.status}`);
  return result;
}
