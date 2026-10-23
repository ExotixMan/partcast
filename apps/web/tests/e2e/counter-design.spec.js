import { test, expect } from '@playwright/test';

const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '77777777-7777-4777-8777-777777777777';
const brakeId = '33333333-3333-4333-8333-333333333333';
const oilId = '99999999-9999-4999-8999-999999999999';
const supplierId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const project = 'ragdjkdcrvexqfadlqbf';
const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ session_id: sessionId, amr: [{ method: 'password' }] })).toString('base64url')}.test-only-signature`;
const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');

async function storeFixture(context, { paginated = false, language = 'en', large = false, dark = false } = {}) {
  await context.addInitScript(({ userId, project, token, language, large, dark }) => {
    localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify({
      access_token: token, refresh_token: 'test-only-refresh', expires_at: 4102444800,
      expires_in: 3600, token_type: 'bearer', user: { id: userId, email: 'staff@example.test', aud: 'authenticated' }
    }));
    localStorage.setItem('partcast-language', language);
    localStorage.setItem('partcast-text-size', large ? 'large' : 'standard');
    localStorage.setItem('partcast-theme', dark ? 'dark' : 'light');
  }, { userId, project, token, language, large, dark });

  const products = [{
    id: brakeId, part_number: 'BP-001', description: 'Toyota brake pad', brand: 'Toyota',
    unit: 'pcs', location: 'Shelf A', current_stock: 5, minimum_stock: 1,
    safety_stock: 1, selling_price: 500, unit_cost: 100, category: 'parts',
    barcode: '123456789012', search_aliases: ['pastilyas'], stock_status: 'ok',
    photo_paths: [`${brakeId}/front.webp`, `${brakeId}/back.webp`]
  }, {
    id: oilId, part_number: 'OIL-001', description: 'Engine oil', brand: 'Brand',
    unit: 'bottles', location: 'Shelf B', current_stock: 8, minimum_stock: 2,
    safety_stock: 1, selling_price: 100, unit_cost: 60, category: 'lubricants',
    barcode: '987654321098', search_aliases: ['langis ng makina'], stock_status: 'ok', photo_paths: []
  }];
  if (paginated) {
    for (let i = 0; i < 25; i++) products.push({
      ...products[0], id: `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`,
      part_number: `FILTER-${String(i + 1).padStart(3, '0')}`,
      description: `Toyota fuel filter ${i + 1}`, barcode: `FILTER${i + 1}`, photo_paths: []
    });
  }

  const batches = [], queries = [], photos = [], receipts = new Map();
  const suppliers = [{ id: supplierId, name: 'Parts supplier' }];
  await context.route('http://localhost:10000/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const headers = { 'access-control-allow-origin': '*' };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { ...headers,
        'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers': 'authorization,content-type' } });
      return;
    }
    let body = { data: [] };
    if (url.pathname === '/api/me') body = { user: { id: userId, full_name: 'Store Staff', role: 'owner',
      active: true, session_id: sessionId, verification_expires_at: '2099-01-01T00:00:00Z' } };
    else if (url.pathname === '/api/forecast/readiness') body = { ready: false, status: 'no_observations',
      record_count: 0, current_part_count: 0, latest_sale_date: null, products: [],
      requirements: { sale_days: 5, calendar_days: 35, maximum_age_days: 31 } };
    else if (url.pathname === '/api/offline-snapshot') body = { products, suppliers };
    else if (url.pathname === '/api/suppliers') body = { data: suppliers };
    else if (url.pathname === '/api/products' && request.method() === 'GET') {
      const query = { q: (url.searchParams.get('q') || '').toLowerCase(),
        category: url.searchParams.get('category') || 'all',
        page: Number(url.searchParams.get('page') || 1), pageSize: Number(url.searchParams.get('pageSize') || 25) };
      queries.push(query);
      const filtered = products.filter(product =>
        `${product.description} ${product.part_number} ${product.barcode} ${product.search_aliases.join(' ')}`.toLowerCase().includes(query.q)
        && (query.category === 'all' || product.category === query.category));
      const start = (query.page - 1) * query.pageSize;
      body = { data: filtered.slice(start, start + query.pageSize), count: filtered.length };
    } else if (url.pathname.startsWith('/api/photos/')) {
      photos.push(url.pathname);
      await route.fulfill({ headers, contentType: 'image/png', body: photo });
      return;
    } else if (url.pathname === '/api/inventory/batch') {
      const batch = request.postDataJSON();
      batches.push(batch);
      if (!receipts.has(batch.client_operation_id)) {
        for (const line of batch.lines) products.find(product => product.id === line.product_id).current_stock
          += (batch.tx_type === 'sale' ? -1 : 1) * line.quantity;
        receipts.set(batch.client_operation_id, { batchId: batch.client_operation_id,
          total: batch.lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unit_price * 100), 0) / 100 });
      }
      body = receipts.get(batch.client_operation_id);
    }
    await route.fulfill({ headers, json: body });
  });
  return { products, batches, queries, photos };
}

test('category tiles reset pagination and combine with name or barcode search', async ({ page, context }) => {
  const store = await storeFixture(context, { paginated: true });
  await page.goto('/counter');
  const catalog = page.getByRole('region', { name: 'Choose parts', exact: true });
  const categories = page.getByRole('group', { name: 'Browse categories', exact: true });
  await expect(categories.getByRole('button')).toHaveCount(6);
  await expect(categories.getByRole('button', { name: 'All categories', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(catalog.getByRole('article')).toHaveCount(25);
  await catalog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(catalog.getByRole('article')).toHaveCount(2);
  await expect.poll(() => store.queries.at(-1)?.page).toBe(2);

  await categories.getByRole('button', { name: 'Oils & lubricants', exact: true }).click();
  await expect.poll(() => store.queries.at(-1)).toMatchObject({ category: 'lubricants', page: 1 });
  await expect(catalog.getByRole('article')).toHaveCount(1);
  await expect(catalog.getByRole('heading', { name: 'Engine oil', exact: true })).toBeVisible();
  await expect(categories.locator('[aria-pressed="true"]')).toHaveCount(1);

  await page.getByLabel('Find a part', { exact: true }).fill('987654321098');
  await expect.poll(() => store.queries.at(-1)).toMatchObject({ q: '987654321098', category: 'lubricants', page: 1 });
  await expect(catalog.getByRole('article')).toHaveCount(1);
  await categories.getByRole('button', { name: 'Car parts', exact: true }).click();
  await expect(catalog.getByText('No parts found. Try another name or category.', { exact: true })).toBeVisible();
  await expect(catalog.getByRole('article')).toHaveCount(0);
  await expect(page.getByLabel('Find a part', { exact: true })).toHaveValue('987654321098');
  await categories.getByRole('button', { name: 'All categories', exact: true }).click();
  await expect(catalog.getByRole('heading', { name: 'Engine oil', exact: true })).toBeVisible();
  await page.getByLabel('Find a part', { exact: true }).fill('');
  await expect(catalog.getByRole('article')).toHaveCount(25);
});

test('part photos maximize without adding stock and the cards preserve sale and delivery baskets', async ({ page, context }) => {
  const store = await storeFixture(context);
  store.products[1].current_stock = 0;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/counter');
  await expect(page.getByText(/Inventory saved/)).toBeVisible();
  const catalog = page.getByRole('region', { name: 'Choose parts', exact: true });
  const product = catalog.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Toyota brake pad', exact: true }) });
  const emptyPart = catalog.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Engine oil', exact: true }) });
  await expect(emptyPart.getByText('Out of stock', { exact: true })).toBeVisible();
  await expect(emptyPart.getByRole('button', { name: 'Add Engine oil to basket', exact: true })).toBeDisabled();
  await expect(catalog.getByText('Add', { exact: true })).toHaveCount(0);
  await expect(catalog.getByText('View photos', { exact: true })).toHaveCount(0);
  const trigger = product.getByRole('button', { name: 'View photos of Toyota brake pad', exact: true });
  await trigger.click();
  const gallery = page.getByRole('dialog', { name: 'Toyota brake pad', exact: true });
  await expect(gallery.getByRole('img')).toHaveCount(1);
  await expect.poll(() => gallery.getByRole('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  expect(await gallery.getByRole('img').evaluateAll(images => images.every(image => getComputedStyle(image).objectFit === 'contain'))).toBe(true);
  const expandedBox = await gallery.getByRole('img').boundingBox();
  expect(expandedBox.width).toBeGreaterThan(1200);
  expect(expandedBox.height).toBeGreaterThan(600);
  await expect(page.locator('#store-basket').getByLabel('Quantity', { exact: true })).toHaveCount(0);
  await expect(gallery.getByRole('button', { name: 'Previous photo', exact: true })).toBeDisabled();
  await gallery.getByRole('button', { name: 'Next photo', exact: true }).click();
  await expect(gallery.getByText('Photo 2 of 2', { exact: true })).toBeVisible();
  await expect(gallery.getByRole('button', { name: 'Next photo', exact: true })).toBeDisabled();
  await expect.poll(() => gallery.getByRole('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  expect(store.photos).toContain(`/api/photos/${brakeId}/back.webp`);
  await page.keyboard.press('ArrowLeft');
  await expect(gallery.getByText('Photo 1 of 2', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/partcast-counter-maximized-photo.png', fullPage: false });
  await gallery.getByRole('button', { name: 'Close modal', exact: true }).click();
  await expect(trigger).toBeFocused();
  await expect(page.locator('#store-basket').getByLabel('Quantity', { exact: true })).toHaveCount(0);
  const photoBox = await product.getByRole('img').boundingBox();
  expect(photoBox.height).toBeGreaterThan(96);
  expect(photoBox.width).toBeGreaterThan(96);
  await page.screenshot({ path: '/tmp/partcast-counter-design-desktop.png', fullPage: false });

  await product.getByRole('button', { name: 'Add Toyota brake pad to basket', exact: true }).click();
  await page.getByRole('button', { name: 'Receive delivery', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Finish this basket or clear it');
  await expect(page.getByRole('button', { name: 'Sell parts', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Quantity', { exact: true })).toHaveValue('1');
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await page.getByLabel('Price per unit', { exact: true }).fill('125.25');
  await page.getByRole('button', { name: '3. Confirm sale', exact: true }).click();
  await expect.poll(() => store.batches.length).toBe(1);
  expect(store.batches[0]).toMatchObject({ tx_type: 'sale', is_credit: false,
    lines: [{ product_id: brakeId, quantity: 2, unit_price: 125.25 }] });
  expect(store.products[0].current_stock).toBe(3);
  await expect(page.getByText('Sale saved. Stock and customer balance updated.', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Receive delivery', exact: true }).click();
  await expect(emptyPart.getByText('Out of stock', { exact: true })).toBeVisible();
  await expect(emptyPart.getByRole('button', { name: 'Add Engine oil to basket', exact: true })).toBeEnabled();
  await catalog.getByRole('button', { name: 'Add Toyota brake pad to basket', exact: true }).click();
  await page.getByLabel('Quantity', { exact: true }).fill('3');
  await page.getByLabel('Cost per unit', { exact: true }).fill('0');
  await page.getByRole('button', { name: '3. Confirm delivery', exact: true }).click();
  await expect.poll(() => store.batches.length).toBe(2);
  expect(store.batches[1]).toMatchObject({ tx_type: 'stock_in', is_credit: false,
    lines: [{ product_id: brakeId, quantity: 3, unit_price: 0 }] });
  expect(store.products[0].current_stock).toBe(6);
});

test('card surfaces and keyboard add once while photo controls leave the basket unchanged', async ({ page, context }) => {
  await storeFixture(context);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/counter');
  const catalog = page.getByRole('region', { name: 'Choose parts', exact: true });
  const card = catalog.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Toyota brake pad', exact: true }) });
  const basket = page.locator('#store-basket');
  await card.scrollIntoViewIfNeeded();
  const title = await card.getByRole('heading').boundingBox();
  await page.mouse.click(title.x + title.width / 2, title.y + title.height / 2);
  await expect(basket.getByLabel('Quantity', { exact: true })).toHaveValue('1');
  const bounds = await card.boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height - 4);
  await expect(basket.getByLabel('Quantity', { exact: true })).toHaveValue('2');
  const action = card.getByRole('button', { name: 'Add Toyota brake pad to basket', exact: true });
  await action.focus();
  await page.keyboard.press('Enter');
  await expect(basket.getByLabel('Quantity', { exact: true })).toHaveValue('3');
  await page.keyboard.press('Space');
  await expect(basket.getByLabel('Quantity', { exact: true })).toHaveValue('4');
  await card.getByRole('button', { name: 'View photos of Toyota brake pad', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Toyota brake pad', exact: true });
  await viewer.getByRole('button', { name: 'Next photo', exact: true }).click();
  await viewer.getByRole('button', { name: 'Previous photo', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(basket.getByLabel('Quantity', { exact: true })).toHaveValue('4');
  await expect(basket.getByText('View photos', { exact: true })).toHaveCount(0);
  await basket.getByRole('button', { name: 'View photos of Toyota brake pad', exact: true }).click();
  await expect(viewer).toBeVisible();
  await viewer.getByRole('button', { name: 'Close modal', exact: true }).click();
  await expect(basket.getByLabel('Quantity', { exact: true })).toHaveValue('4');
  const placeholder = catalog.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Engine oil', exact: true }) });
  await placeholder.scrollIntoViewIfNeeded();
  const placeholderBox = await placeholder.locator('.counter-product-placeholder').boundingBox();
  await page.mouse.click(placeholderBox.x + placeholderBox.width / 2, placeholderBox.y + placeholderBox.height / 2);
  await expect(basket.getByLabel('Quantity', { exact: true })).toHaveCount(2);
  await expect(basket.getByLabel('Quantity', { exact: true }).nth(1)).toHaveValue('1');
});

test('maximized photos keep their controls visible with a long name on a short screen', async ({ page, context }) => {
  const store = await storeFixture(context, { large: true });
  const longName = 'Toyota brake pad and fitting accessories for a commercial vehicle '.repeat(7).trim();
  store.products[0].description = longName;
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto('/counter');
  await page.getByRole('button', { name: `View photos of ${longName}`, exact: true }).click();
  const viewer = page.getByRole('dialog', { name: longName, exact: true });
  await expect(viewer.getByRole('heading', { name: longName, exact: true })).toBeVisible();
  await expect(viewer.getByRole('img')).toBeVisible();
  expect((await viewer.getByRole('img').boundingBox()).height).toBeGreaterThan(100);
  await expect(viewer.getByRole('button', { name: 'Close modal', exact: true })).toBeInViewport();
  await expect(viewer.getByRole('button', { name: 'Next photo', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await viewer.getByRole('button', { name: 'Next photo', exact: true }).click();
  await expect(viewer.getByText('Photo 2 of 2', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(page.locator('#store-basket').getByLabel('Quantity', { exact: true })).toHaveCount(0);
});

for (const width of [320, 390]) {
  test(`${width}px category tiles and basket controls fit Tagalog with larger text and dark mode`, async ({ page, context }) => {
    await storeFixture(context, { paginated: true, language: 'fil', large: true, dark: true });
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/counter');
    await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const headingContrast = await page.getByRole('heading', { level: 1 }).evaluate(element => {
      const luminance = color => {
        const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
          const channel = value / 255;
          return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        });
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
      };
      const foreground = luminance(getComputedStyle(element).color);
      const background = luminance(getComputedStyle(document.body).backgroundColor);
      return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
    });
    expect(headingContrast).toBeGreaterThanOrEqual(4.5);
    const categories = page.locator('.counter-categories[role="group"]');
    await expect(categories.getByRole('button')).toHaveCount(6);
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(await fits()).toBe(true);
    for (const button of await categories.getByRole('button').all()) {
      const box = await button.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(await button.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    }
    await expect(page.getByRole('button', { name: 'Idagdag ang Toyota brake pad sa basket', exact: true })).toBeVisible();
    await page.screenshot({ path: `/tmp/partcast-counter-design-${width}-tagalog-dark.png`, fullPage: false });
    const photoTrigger = page.getByRole('button', { name: 'Tingnan ang mga larawan ng Toyota brake pad', exact: true });
    await photoTrigger.click();
    const viewer = page.getByRole('dialog', { name: 'Toyota brake pad', exact: true });
    await expect(viewer.getByRole('img')).toBeVisible();
    const photoBounds = await viewer.getByRole('img').boundingBox();
    expect(photoBounds.width).toBeGreaterThan(width * .9);
    expect(photoBounds.height).toBeGreaterThan(500);
    expect(await fits()).toBe(true);
    await viewer.getByRole('button', { name: 'Susunod na larawan', exact: true }).click();
    await expect(viewer.getByText('Larawan 2 sa 2', { exact: true })).toBeVisible();
    await page.screenshot({ path: `/tmp/partcast-counter-design-${width}-photo.png`, fullPage: false });
    await page.keyboard.press('Escape');
    await expect(photoTrigger).toBeFocused();
    await expect(page.locator('#store-basket').getByLabel('Dami', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Idagdag ang Toyota brake pad sa basket', exact: true }).click();
    const shortcut = page.locator('.counter-basket-shortcut');
    await expect(shortcut).toBeVisible();
    const shortcutBox = await shortcut.boundingBox();
    const navigationBox = await page.locator('nav:has(.mobile-nav-item)').boundingBox();
    expect(shortcutBox.x).toBeGreaterThanOrEqual(0);
    expect(shortcutBox.x + shortcutBox.width).toBeLessThanOrEqual(width);
    expect(shortcutBox.y + shortcutBox.height).toBeLessThanOrEqual(navigationBox.y + 1);
    await shortcut.getByRole('link', { name: 'Tingnan', exact: true }).click();
    const price = page.getByLabel('Presyo bawat unit', { exact: true });
    await expect(price).toBeInViewport();
    await price.fill('250.50');
    expect(await fits()).toBe(true);
    const confirm = page.getByRole('button', { name: '3. I-save ang benta', exact: true });
    await confirm.scrollIntoViewIfNeeded();
    await expect(confirm).toBeEnabled();
    const confirmBox = await confirm.boundingBox();
    expect(confirmBox.x).toBeGreaterThanOrEqual(0);
    expect(confirmBox.x + confirmBox.width).toBeLessThanOrEqual(width);
    expect(await confirm.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `/tmp/partcast-counter-design-${width}-basket.png`, fullPage: false });
  });
}
