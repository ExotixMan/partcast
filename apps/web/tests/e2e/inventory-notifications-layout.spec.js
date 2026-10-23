import { test, expect } from '@playwright/test';

const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '77777777-7777-4777-8777-777777777777';
const project = 'ragdjkdcrvexqfadlqbf';
const brakeId = '33333333-3333-4333-8333-333333333333';
const oilId = '99999999-9999-4999-8999-999999999999';
const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ session_id: sessionId, amr: [{ method: 'password' }] })).toString('base64url')}.test-only-signature`;
const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');

async function fixture(context, { role = 'owner', paginated = false, language = 'en', large = false, dark = false, copyFails = false, failProducts = false } = {}) {
  await context.addInitScript(({ userId, project, token, language, large, dark, copyFails }) => {
    localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify({ access_token: token, refresh_token: 'test-only-refresh',
      expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: userId, email: 'staff@example.test', aud: 'authenticated' } }));
    localStorage.setItem('partcast-language', language);
    localStorage.setItem('partcast-text-size', large ? 'large' : 'standard');
    localStorage.setItem('partcast-theme', dark ? 'dark' : 'light');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => {
      if (copyFails) throw new DOMException('Clipboard denied', 'NotAllowedError');
      window.__layoutCopiedSku = value;
    } } });
  }, { userId, project, token, language, large, dark, copyFails });

  const products = [{ id: brakeId, description: 'Toyota brake pad', part_number: 'BP-001', barcode: 'BOX-001', category: 'parts',
    brand: 'Toyota', unit: 'pc', location: 'Shelf A', current_stock: 0, minimum_stock: 2, safety_stock: 1,
    selling_price: 125.5, unit_cost: 75, search_aliases: ['pastilyas'], active: true, stock_status: 'out',
    photo_paths: [`${brakeId}/front.webp`, `${brakeId}/back.webp`] },
  { id: oilId, description: 'Engine oil', part_number: 'OIL-001', barcode: 'OIL-BARCODE', category: 'lubricants', brand: 'Brand',
    unit: 'bottle', location: 'Shelf B', current_stock: 1, minimum_stock: 2, safety_stock: 1, selling_price: 200, unit_cost: 100,
    search_aliases: ['langis'], photo_paths: [], active: true, stock_status: 'low' },
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', description: 'Phone holder', part_number: 'ACC-001', barcode: 'ACC-BARCODE',
    category: 'accessories', brand: 'Brand', unit: 'pc', location: 'Shelf C', current_stock: 12, minimum_stock: 1,
    safety_stock: 1, selling_price: 50, unit_cost: 25, search_aliases: [], photo_paths: [], active: true, stock_status: 'ok' }];
  if (paginated) for (let i = 0; i < 26; i++) products.push({ ...products[0],
    id: `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`, description: `Toyota air filter ${i + 1}`,
    part_number: `FILTER-${i + 1}`, barcode: `FILTER-CODE-${i + 1}`, current_stock: 4, minimum_stock: 1,
    photo_paths: [], stock_status: 'ok' });
  const alerts = [{ id: 'low', kind: 'low', read: false, created_at: new Date(Date.now() - 2 * 3600000).toISOString(), product: { ...products[1] } },
    { id: 'out-read', kind: 'out', read: true, created_at: new Date(Date.now() - 3 * 3600000).toISOString(), product: { ...products[0], description: 'Air filter', part_number: 'FILTER-OUT' } },
    { id: 'out-new', kind: 'out', read: false, created_at: new Date(Date.now() - 3600000).toISOString(), product: { ...products[0] } }];
  const productQueries = [], marked = [], writes = [];
  let productFailure = failProducts;
  await context.route('http://localhost:10000/**', async route => {
    const request = route.request(), url = new URL(request.url()), headers = { 'access-control-allow-origin': '*' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers,
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-allow-headers': 'authorization,content-type' } });
    let body = { data: [] };
    if (url.pathname === '/api/me') body = { user: { id: userId, full_name: 'Store Staff', role, active: true,
      session_id: sessionId, verification_expires_at: '2099-01-01T00:00:00Z' } };
    else if (url.pathname === '/api/offline-snapshot') body = { products, suppliers: [] };
    else if (url.pathname === '/api/notifications') body = { data: alerts };
    else if (url.pathname.startsWith('/api/notifications/') && request.method() === 'POST') {
      const id = url.pathname.split('/')[3]; marked.push(id); alerts.find(alert => alert.id === id).read = true; body = { ok: true };
    } else if (url.pathname === '/api/products' && request.method() === 'GET') {
      if (productFailure) return route.fulfill({ status: 503, headers, json: { error: 'Inventory is temporarily unavailable.' } });
      const query = { q: (url.searchParams.get('q') || '').toLowerCase(), category: url.searchParams.get('category') || 'all',
        status: url.searchParams.get('status') || 'all', page: Number(url.searchParams.get('page') || 1), pageSize: Number(url.searchParams.get('pageSize') || 25) };
      productQueries.push(query);
      const filtered = products.filter(part => part.active !== false
        && `${part.description} ${part.part_number} ${part.barcode} ${part.search_aliases.join(' ')}`.toLowerCase().includes(query.q)
        && (query.category === 'all' || part.category === query.category)
        && (query.status === 'all' || part.stock_status === query.status));
      const start = (query.page - 1) * query.pageSize;
      body = { data: filtered.slice(start, start + query.pageSize), count: filtered.length };
    } else if (url.pathname === '/api/reorder') body = { data: products.slice(0, 2).map(part => ({ ...part,
      product_id: part.id, recommended_quantity: 2, status: part.current_stock === 0 ? 'out_of_stock' : 'low_stock' })) };
    else if (url.pathname.startsWith('/api/photos/')) return route.fulfill({ headers, contentType: 'image/png', body: photo });
    else if (['POST', 'PATCH', 'DELETE'].includes(request.method())) { writes.push({ path: url.pathname, body: request.postDataJSON() }); body = { ok: true }; }
    await route.fulfill({ headers, json: body });
  });
  return { products, alerts, productQueries, marked, writes, setProductFailure: value => { productFailure = value; } };
}

const notificationCard = (dialog, name = 'Toyota brake pad') => dialog.getByRole('article').filter({ has: dialog.page().getByRole('heading', { name, exact: true }) });

test('notification rows show SKU, stock, threshold and relative time with independent copy and read actions', async ({ page, context }) => {
  const store = await fixture(context);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Stock notifications, 2 unread', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Stock notifications', exact: true });
  const row = notificationCard(dialog);
  await expect(dialog.getByRole('article').first().getByRole('heading')).toHaveText('Toyota brake pad');
  await expect(row.getByText('BP-001', { exact: false })).toBeVisible();
  await expect(row.getByText('Out of stock', { exact: true })).toBeVisible();
  await expect(row.locator('.notification-unread-dot')).toBeVisible();
  await expect(row.getByText('New alert', { exact: true })).toBeAttached();
  await expect(row.locator('dl')).toContainText(/Stock\s*:?\s*0\s*pc/);
  await expect(row.locator('dl')).toContainText(/Threshold\s*:?\s*2\s*pc/);
  await expect(row.locator('time')).toContainText(/1\s*(hr|hour)/i);
  await expect(row.locator('time')).toHaveAttribute('title', /\d/);
  await row.getByRole('button', { name: 'Copy SKU', exact: true }).click();
  await expect(dialog.getByText('SKU copied.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__layoutCopiedSku)).toBe('BP-001');
  await row.getByRole('button', { name: 'Mark as read', exact: true }).click();
  await expect(row.locator('.notification-unread-dot')).toHaveCount(0);
  await expect(row.getByText('Out of stock', { exact: true })).toBeVisible();
  await expect(row.getByText('Read', { exact: true })).toBeVisible();
  expect(store.marked).toEqual(['out-new']);
  await expect(dialog.getByRole('article')).toHaveCount(3);
  await expect(page.locator('header button[aria-label="Stock notifications, 1 unread"]')).toBeAttached();
  await page.screenshot({ path: '/tmp/partcast-notifications-reference-desktop.png', fullPage: false });
});

test('notification copying reports failure and missing SKU or invalid dates stay truthful', async ({ page, context }) => {
  const store = await fixture(context, { copyFails: true });
  store.alerts.find(alert => alert.id === 'out-new').created_at = 'not-a-date';
  store.alerts.find(alert => alert.id === 'low').product.part_number = '';
  await page.goto('/inventory');
  await page.getByRole('button', { name: /Stock notifications/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Stock notifications', exact: true }), row = notificationCard(dialog);
  await expect(row.getByText('Date unavailable', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Copy SKU', exact: true }).click();
  await expect(dialog.getByText('Could not copy SKU.', { exact: true })).toBeVisible();
  await expect(dialog.getByText('SKU copied.', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__layoutCopiedSku)).toBeUndefined();
  await expect(notificationCard(dialog, 'Engine oil').getByRole('button', { name: 'Copy SKU', exact: true })).toBeDisabled();
});

test('a notification Restock action opens the selected part in the restock list', async ({ page, context }) => {
  await fixture(context);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/reorder?q=OIL-001');
  await expect(page.getByLabel('Search parts to restock', { exact: true })).toHaveValue('OIL-001');
  await page.getByLabel('Stock status', { exact: true }).selectOption('low_stock');
  await page.getByRole('button', { name: 'Suppliers', exact: true }).click();
  await page.getByRole('button', { name: /Stock notifications/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Stock notifications', exact: true });
  await notificationCard(dialog).getByRole('link', { name: 'Restock', exact: true }).click();
  await expect(page).toHaveURL(/\/reorder\?q=BP-001$/);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Search parts to restock', { exact: true })).toHaveValue('BP-001');
  await expect(page.getByLabel('Stock status', { exact: true })).toHaveValue('all');
  await expect(page.getByRole('button', { name: 'Parts to restock', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('table').getByText('Toyota brake pad', { exact: true })).toBeVisible();
  await expect(page.getByText('Engine oil', { exact: true })).toHaveCount(0);
  await page.getByLabel('Stock status', { exact: true }).selectOption('low_stock');
  await page.getByRole('button', { name: 'Suppliers', exact: true }).click();
  await page.getByRole('button', { name: /Stock notifications/ }).click();
  await notificationCard(dialog).getByRole('link', { name: 'Restock', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Parts to restock', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Stock status', { exact: true })).toHaveValue('all');
  await expect(page.getByRole('table').getByText('Toyota brake pad', { exact: true })).toBeVisible();
});

test('cashier notification actions lead to matching read-only inventory', async ({ page, context }) => {
  await fixture(context, { role: 'cashier' });
  await page.goto('/inventory');
  const initialInventory = page.getByRole('region', { name: 'Your inventory', exact: true });
  await initialInventory.getByLabel('Category', { exact: true }).selectOption('lubricants');
  await initialInventory.getByRole('button', { name: 'Running low', exact: true }).click();
  await expect(initialInventory.getByRole('article').getByRole('heading', { name: 'Engine oil', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Stock notifications/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Stock notifications', exact: true }), row = notificationCard(dialog);
  await expect(row.getByRole('link', { name: 'Restock', exact: true })).toHaveCount(0);
  await row.getByRole('link', { name: 'View inventory', exact: true }).click();
  await expect(page).toHaveURL(/\/inventory\?q=BP-001$/);
  const inventory = page.getByRole('region', { name: 'Your inventory', exact: true });
  await expect(inventory.getByLabel('Search inventory', { exact: true })).toHaveValue('BP-001');
  await expect(inventory.getByLabel('Category', { exact: true })).toHaveValue('all');
  await expect(inventory.getByRole('button', { name: 'All parts', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(inventory.getByRole('article')).toHaveCount(1);
  await expect(inventory.getByRole('button', { name: 'Edit details', exact: true })).toHaveCount(0);
  await expect(inventory.getByRole('button', { name: 'Adjust stock', exact: true })).toHaveCount(0);
  await inventory.getByLabel('Search inventory', { exact: true }).fill('OIL-001');
  await inventory.getByLabel('Category', { exact: true }).selectOption('lubricants');
  await inventory.getByRole('button', { name: 'Running low', exact: true }).click();
  await expect(inventory.getByRole('heading', { name: 'Engine oil', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Stock notifications/ }).click();
  await notificationCard(dialog).getByRole('link', { name: 'View inventory', exact: true }).click();
  await expect(inventory.getByLabel('Search inventory', { exact: true })).toHaveValue('BP-001');
  await expect(inventory.getByLabel('Category', { exact: true })).toHaveValue('all');
  await expect(inventory.getByRole('heading', { name: 'Toyota brake pad', exact: true })).toBeVisible();
});

test('inventory composes search, category, stock level and pagination without stale results', async ({ page, context }) => {
  const store = await fixture(context, { paginated: true, failProducts: true });
  await page.goto('/inventory');
  const inventory = page.getByRole('region', { name: 'Your inventory', exact: true });
  await expect(page.getByRole('alert')).toContainText('Inventory is temporarily unavailable.');
  await expect(inventory.getByRole('article')).toHaveCount(0);
  await expect(inventory.getByText(/0 records/)).toHaveCount(0);
  store.setProductFailure(false);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(inventory.getByRole('article')).toHaveCount(25);
  await inventory.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(inventory.getByRole('article')).toHaveCount(4);
  await expect.poll(() => store.productQueries.at(-1)?.page).toBe(2);
  await inventory.getByLabel('Category', { exact: true }).selectOption('lubricants');
  await expect(inventory.getByRole('article')).toHaveCount(1);
  await expect.poll(() => store.productQueries.at(-1)).toMatchObject({ category: 'lubricants', page: 1 });
  await inventory.getByLabel('Search inventory', { exact: true }).fill('OIL-BARCODE');
  await inventory.getByRole('button', { name: 'Running low', exact: true }).click();
  await expect.poll(() => store.productQueries.at(-1)).toMatchObject({ q: 'oil-barcode', category: 'lubricants', status: 'low', page: 1 });
  await expect(inventory.getByRole('article').getByRole('heading', { name: 'Engine oil', exact: true })).toBeVisible();
  await inventory.getByRole('button', { name: 'Out of stock', exact: true }).click();
  await expect(inventory.getByRole('article')).toHaveCount(0);
  await inventory.getByRole('button', { name: 'Show all parts', exact: true }).click();
  await expect.poll(() => store.productQueries.at(-1)).toMatchObject({ q: '', category: 'all', status: 'all', page: 1 });
  await expect(inventory.getByRole('article')).toHaveCount(25);
});

test('inventory rows keep photos, edit and correction actions separate from shelf details', async ({ page, context }) => {
  const store = await fixture(context);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/inventory');
  const inventory = page.getByRole('region', { name: 'Your inventory', exact: true });
  const row = inventory.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Toyota brake pad', exact: true }) });
  await expect(row.getByText('Available stock', { exact: true })).toBeVisible();
  await expect(row.getByText('₱125.50', { exact: true })).toBeVisible();
  await expect(row.getByText('Shelf A', { exact: true })).toBeHidden();
  await row.locator('summary').click();
  await expect(row.getByText('Shelf A', { exact: true })).toBeVisible();
  await row.locator('summary').click();
  await row.getByRole('button', { name: 'View photos of Toyota brake pad', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Toyota brake pad', exact: true });
  await expect(viewer.getByRole('img')).toBeVisible();
  await expect.poll(() => viewer.getByRole('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(await viewer.getByRole('img').evaluate(image => getComputedStyle(image).objectFit)).toBe('contain');
  await viewer.getByRole('button', { name: 'Close modal', exact: true }).click();
  await row.getByRole('button', { name: 'Edit details', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit part details', exact: true });
  await expect(edit.getByLabel('Part name *', { exact: true })).toHaveValue('Toyota brake pad');
  await edit.getByRole('button', { name: 'Cancel', exact: true }).click();
  await inventory.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Engine oil', exact: true }) })
    .getByRole('button', { name: 'Adjust stock', exact: true }).click();
  const correction = page.getByRole('dialog', { name: 'Adjust stock count', exact: true });
  await expect(correction.getByLabel('Quantity *', { exact: true })).toHaveValue('1');
  await correction.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(store.writes).toHaveLength(0);
  await page.screenshot({ path: '/tmp/partcast-inventory-layout-desktop.png', fullPage: false });
});

test('inventory and reference alerts fit small phones in larger Tagalog text and dark mode', async ({ page, context }) => {
  await fixture(context, { language: 'fil', large: true, dark: true });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/inventory');
    const inventory = page.locator('.inventory-part-card');
    await expect(inventory).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const row = inventory.first();
    await expect(row.getByRole('button', { name: 'I-edit ang detalye', exact: true })).toBeVisible();
    for (const control of await row.getByRole('button').all()) {
      const box = await control.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: `/tmp/partcast-inventory-layout-${width}-phone.png`, fullPage: false });
    if (width === 320) await page.screenshot({ path: '/tmp/partcast-inventory-layout-phone.png', fullPage: false });
    await page.getByRole('button', { name: /Mga abiso sa stock/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Mga abiso sa stock', exact: true });
    const alert = notificationCard(dialog);
    await expect(alert.getByRole('heading', { name: 'Toyota brake pad', exact: true })).toBeVisible();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await alert.scrollIntoViewIfNeeded();
    for (const control of await alert.locator('button,a[href]').all()) {
      const box = await control.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: `/tmp/partcast-notifications-reference-${width}-phone.png`, fullPage: false });
    if (width === 320) await page.screenshot({ path: '/tmp/partcast-notifications-reference-phone.png', fullPage: false });
    await page.keyboard.press('Escape');
  }
});
