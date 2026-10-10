import crypto from 'node:crypto';
import { sendGmailMessage } from './gmail.js';
import { escapeHtml } from './helpers.js';

export function recommendationHash(items) {
  const normalized = items
    .map(i => `${i.product_id}:${Number(i.recommended_quantity).toFixed(2)}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export async function sendSupplierEmail({ supplier, items, subject, message, extra_columns = [] }) {
  const rows = items.map(item => `
    <tr>
      <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(item.part_number || 'N/A')}</td>
      <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(item.description)}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;text-align:right">${Number(item.current_stock).toLocaleString('en-PH',{maximumFractionDigits:2})}</td>
      <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(item.unit || 'units')}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;text-align:right">${Number(item.quantity ?? Math.ceil(Number(item.recommended_quantity))).toLocaleString('en-PH',{maximumFractionDigits:2})}</td>
      ${extra_columns.map(col=>`<td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(item.extra_values?.[col.id]||'')}</td>`).join('')}
    </tr>`).join('');

  const htmlContent = `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
      <h2>NPG Autoparts Supply Request</h2>
      <p>Hello ${escapeHtml(supplier.contact_person || supplier.name)},</p>
      <p>${escapeHtml(message || 'Please confirm availability, price, and expected delivery schedule for these parts.').replace(/\n/g,'<br>')}</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <thead><tr>
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Part number</th>
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Description</th>
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:right">In stock</th>
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Unit</th>
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:right">Quantity</th>
          ${extra_columns.map(col=>`<th style="padding:8px;border:1px solid #e5e7eb;text-align:left">${escapeHtml(col.label)}</th>`).join('')}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p>This is an automated inventory replenishment request from NPG Autoparts. A staff member will review your reply before a purchase is finalized.</p>
    </div>`;

  const text=[`Hello ${supplier.contact_person||supplier.name},`,message||'Please confirm availability, price, and expected delivery schedule for these parts.',
    ...items.map(i=>[i.part_number||'N/A',i.description,`${i.quantity??Math.ceil(Number(i.recommended_quantity))} ${i.unit||'units'}`,...extra_columns.map(c=>`${c.label}: ${i.extra_values?.[c.id]||''}`)].join(' | ')),
    'This request does not finalize a purchase. Please confirm prices and delivery.'].join('\n');
  return sendGmailMessage({to:supplier.email,subject:subject||`NPG Autoparts - Replenishment request (${items.length} items)`,text,html:htmlContent});
}
