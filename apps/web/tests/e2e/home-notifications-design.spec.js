import { test, expect } from '@playwright/test';

const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '77777777-7777-4777-8777-777777777777';
const project = 'ragdjkdcrvexqfadlqbf';
const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ session_id: sessionId, amr: [{ method: 'password' }] })).toString('base64url')}.test-only-signature`;

async function fixture(context, { language = 'en', large = false, dark = false, emptySales = false } = {}) {
  await context.addInitScript(({ userId, project, token, language, large, dark }) => {
    localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify({
      access_token: token, refresh_token: 'test-only-refresh', expires_at: 4102444800,
      expires_in: 3600, token_type: 'bearer', user: { id: userId, email: 'staff@example.test', aud: 'authenticated' }
    }));
    localStorage.setItem('partcast-language', language);
    localStorage.setItem('partcast-text-size', large ? 'large' : 'standard');
    localStorage.setItem('partcast-theme', dark ? 'dark' : 'light');
  }, { userId, project, token, language, large, dark });

  const product = {
    id: '33333333-3333-4333-8333-333333333333', part_number: 'BP-001', description: 'Toyota brake pad',
    current_stock: 0, minimum_stock: 2, safety_stock: 1, selling_price: 500, unit_cost: 100,
    unit: 'pcs', category: 'parts', stock_status: 'out', photo_paths: [], search_aliases: []
  };
  const alerts = [{
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', kind: 'low', read: false, created_at: '2026-10-17T01:00:00Z',
    product: { part_number: 'OIL-001', description: 'Engine oil', current_stock: 1, minimum_stock: 2, unit: 'bottles' }
  }, {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', kind: 'out', read: true, created_at: '2026-10-17T02:00:00Z',
    product: { part_number: 'FILTER-001', description: 'Air filter', current_stock: 0, minimum_stock: 3, unit: 'pcs' }
  }, {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', kind: 'out', read: false, created_at: '2026-10-17T03:00:00Z',
    product: { part_number: 'BP-001', description: 'Toyota brake pad', current_stock: 0, minimum_stock: 2, unit: 'pcs' }
  }];
  const marked = [];
  const dashboard = {
    metrics: { totalProducts: 3, lowStock: 1, outOfStock: 1, inventoryValue: 5000 },
    salesTrend: emptySales ? [] : [{ day: '2026-10-21', revenue: 1250 }, { day: '2026-10-22', revenue: 875 }],
    fastMoving: [{ product_id: product.id, description: product.description, part_number: product.part_number, quantity: 7 }],
    slowMoving: [], latestForecastRun: null,
    reorder: [{ product_id: product.id, description: product.description, part_number: product.part_number,
      current_stock: 0, recommended_quantity: 2, status: 'out_of_stock', unit: 'pcs' }]
  };
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
    if (url.pathname === '/api/me') body = { user: { id: userId, full_name: 'Store Staff', role: 'owner', active: true,
      session_id: sessionId, verification_expires_at: '2099-01-01T00:00:00Z' } };
    else if (url.pathname === '/api/offline-snapshot') body = { products: [product], suppliers: [] };
    else if (url.pathname === '/api/dashboard') body = dashboard;
    else if (url.pathname === '/api/products') body = { data: [product], count: 1 };
    else if (url.pathname === '/api/reorder') body = { data: dashboard.reorder };
    else if (url.pathname === '/api/notifications') body = { data: alerts };
    else if (url.pathname.startsWith('/api/notifications/') && request.method() === 'POST') {
      const id = url.pathname.split('/')[3];
      marked.push(id);
      alerts.find(alert => alert.id === id).read = true;
      body = { ok: true };
    }
    await route.fulfill({ headers, json: body });
  });
  return { alerts, marked, dashboard };
}

test('Home shows actual sales analytics before everyday actions without opening details', async ({ page, context }) => {
  await fixture(context);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const overview = page.getByRole('region', { name: 'Store overview', exact: true });
  const actions = page.getByRole('region', { name: 'What would you like to do?', exact: true });
  await expect(overview).toBeVisible();
  await expect(overview.getByText('₱2,125.00', { exact: true })).toBeVisible();
  await expect(overview.getByText('₱5,000.00', { exact: true })).toBeVisible();
  const chart = overview.getByRole('img', { name: 'Sales revenue over the last 30 days', exact: true });
  await expect(chart).toBeVisible();
  await expect(chart.locator('.recharts-line-curve')).toHaveCount(1);
  expect(await overview.evaluate(element => Boolean(element.closest('details')))).toBe(false);
  expect((await chart.boundingBox()).y + (await chart.boundingBox()).height).toBeLessThanOrEqual((await actions.boundingBox()).y);
  await page.screenshot({ path: '/tmp/partcast-home-analytics-desktop.png', fullPage: false });
  await page.getByLabel('Find a part', { exact: true }).fill('BP-001');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(page).toHaveURL(/\/inventory\?q=BP-001$/);
});

test('Home explains an empty sales period while keeping analytics first and tasks available', async ({ page, context }) => {
  await fixture(context, { emptySales: true });
  await page.goto('/');
  const overview = page.getByRole('region', { name: 'Store overview', exact: true });
  await expect(overview.getByText('No recorded sales for this period.', { exact: true })).toBeVisible();
  await expect(overview.getByRole('img', { name: 'Sales revenue over the last 30 days', exact: true })).toHaveCount(0);
  expect(await overview.evaluate(element => Boolean(element.closest('details')))).toBe(false);
  const actions = page.getByRole('region', { name: 'What would you like to do?', exact: true });
  expect((await overview.boundingBox()).y).toBeLessThan((await actions.boundingBox()).y);
  await actions.getByRole('link', { name: /Receive stock/ }).click();
  await expect(page).toHaveURL(/\/counter\?mode=stock_in$/);
  await expect(page.getByRole('button', { name: 'Receive delivery', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('selected navigation keeps its highlight without a left stripe in the sidebar and drawer', async ({ page, context }) => {
  await fixture(context);
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const path of ['/', '/counter', '/inventory', '/debts', '/reorder', '/reports', '/settings']) {
    await page.goto(path);
    const navigation = page.getByRole('navigation', { name: 'Main navigation', exact: true });
    const current = navigation.locator('a[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('href', path);
    expect(await navigation.locator('a').evaluateAll(links => links.every(link => getComputedStyle(link).borderLeftWidth === '0px'))).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  const drawer = page.getByRole('navigation', { name: 'All pages', exact: true });
  await expect(drawer.locator('a[aria-current="page"]')).toHaveAttribute('href', '/settings');
  expect(await drawer.locator('a').evaluateAll(links => links.every(link => getComputedStyle(link).borderLeftWidth === '0px'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'All pages', exact: true })).toHaveCount(0);
});

test('compact alerts show stock metadata and keep unresolved stock problems after reading', async ({ page, context }) => {
  const store = await fixture(context);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Stock notifications, 2 unread', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Stock notifications', exact: true });
  const cards = dialog.getByRole('article');
  await expect(cards).toHaveCount(3);
  await expect(cards.getByRole('heading')).toHaveText(['Toyota brake pad', 'Air filter', 'Engine oil']);
  expect(await cards.evaluateAll(elements => elements.every(element => parseFloat(getComputedStyle(element).borderLeftWidth) <= 1))).toBe(true);
  const filters = dialog.getByRole('group', { name: 'Filter stock alerts', exact: true });
  for (const name of ['All alerts', 'Unread', 'Out of stock', 'Running low']) {
    const filter = filters.getByRole('button', { name, exact: true });
    await expect(filter).toBeVisible();
    expect(await filter.locator('svg').count()).toBeGreaterThan(0);
  }
  const out = cards.first();
  await expect(out.getByText('Threshold:', { exact: true })).toBeVisible();
  await expect(out.locator('time')).toBeVisible();
  await expect(out.locator('time')).toHaveAttribute('datetime', '2026-10-17T03:00:00.000Z');
  await expect(out.locator('summary')).toHaveCount(0);
  await out.getByRole('button', { name: 'Mark as read', exact: true }).click();
  await expect(out.getByText('Read', { exact: true })).toBeVisible();
  await expect(out.getByText('Out of stock', { exact: true })).toBeVisible();
  await expect(cards).toHaveCount(3);
  expect(store.marked).toEqual(['cccccccc-cccc-4ccc-8ccc-cccccccccccc']);
  await expect(page.locator('header button[aria-label="Stock notifications, 1 unread"]')).toBeAttached();
  await filters.getByRole('button', { name: 'Unread', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.getByRole('heading')).toHaveText(['Engine oil']);
  await filters.getByRole('button', { name: 'All alerts', exact: true }).click();
  await dialog.getByLabel('Find a stock alert', { exact: true }).fill('BP-001');
  await expect(cards).toHaveCount(1);
  await expect(cards.getByRole('heading')).toHaveText(['Toyota brake pad']);
  await dialog.getByLabel('Find a stock alert', { exact: true }).fill('');
  await page.screenshot({ path: '/tmp/partcast-notifications-clean-desktop.png', fullPage: false });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Stock notifications, 1 unread', exact: true })).toBeFocused();
});

test('analytics and icon-led alerts fit a 320px phone in larger Tagalog text and dark mode', async ({ page, context }) => {
  await fixture(context, { language: 'fil', large: true, dark: true });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
  const overview = page.locator('section[aria-labelledby="overview-heading"]');
  await expect(overview).toBeVisible();
  for (const value of ['₱2,125.00', '₱5,000.00']) {
    const amount = overview.getByText(value, { exact: true });
    expect(await amount.evaluate(element => element.getBoundingClientRect().height <= parseFloat(getComputedStyle(element).lineHeight) + 1)).toBe(true);
  }
  const chart = page.getByRole('img', { name: 'Halaga ng benta sa huling 30 araw', exact: true });
  await expect(chart).toBeVisible();
  expect((await overview.boundingBox()).y).toBeLessThan((await page.locator('section[aria-labelledby="start-heading"]').boundingBox()).y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/partcast-home-analytics-phone.png', fullPage: false });
  await page.getByRole('button', { name: /Mga abiso sa stock/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Mga abiso sa stock', exact: true });
  const filters = dialog.locator('.notification-filters');
  await expect(filters.getByRole('button')).toHaveCount(4);
  for (const button of await filters.getByRole('button').all()) {
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await button.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const firstName = await dialog.getByRole('article').first().getByRole('heading').boundingBox();
  const footer = await dialog.locator('a[href="/reorder"]').locator('..').locator('..').boundingBox();
  expect(firstName.y + firstName.height).toBeLessThanOrEqual(footer.y);
  await page.screenshot({ path: '/tmp/partcast-notifications-clean-phone.png', fullPage: false });
  await expect(dialog.getByRole('article').first().locator('time')).toBeVisible();
});
