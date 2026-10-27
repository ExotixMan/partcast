import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test('Google can read the ownership tag and public app homepage without scripts or authentication', async ({ browser, request }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
  const source = await response.text();
  const tags = [...source.matchAll(/<meta name="google-site-verification" content="([^"]+)"\s*\/?>/g)];
  expect(tags).toHaveLength(1);
  expect(tags[0][1].length).toBeGreaterThan(20);
  const context = await browser.newContext({ baseURL: 'http://localhost:4173', javaScriptEnabled: false, serviceWorkers: 'block' });
  const external = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://localhost:4173') return route.continue();
    external.push(route.request().url());
    return route.abort('failed');
  });
  const page = await context.newPage();
  expect((await page.goto('/about.html')).status()).toBe(200);
  await expect(page).toHaveTitle('PartCast | Inventory and sales for NPG Auto Parts');
  await expect(page.getByRole('heading', { name: 'PartCast', exact: true })).toBeVisible();
  await expect(page.locator('meta[name="google-site-verification"]')).toHaveAttribute('content', tags[0][1]);
  await expect(page.getByRole('heading', { name: 'How PartCast uses Google', exact: true })).toBeVisible();
  await expect(page.getByText(/Gmail send permission/)).toBeVisible();
  await expect(page.getByText(/PartCast does not read the account’s inbox or contacts/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'npgautoparts@gmail.com', exact: true }).first()).toHaveAttribute('href', 'mailto:npgautoparts@gmail.com');
  await expect(page.getByRole('navigation', { name: 'Public pages' }).getByRole('link', { name: 'Privacy Policy', exact: true })).toHaveAttribute('href', '/privacy.html');
  await page.getByRole('navigation', { name: 'Public pages' }).getByRole('link', { name: 'Terms of Service', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Terms of Service', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'PartCast home', exact: true }).click();
  await expect(page).toHaveURL(/\/about\.html$/);
  expect(external).toEqual([]);
  await context.close();
});

test('the downloadable Google logo is an actual small square PNG', async ({ page }) => {
  await page.goto('/brand/index.html');
  await expect(page.getByRole('img', { name: 'PartCast PC emblem', exact: true })).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download logo (PNG)', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('partcast-logo.png');
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.readUInt32BE(16)).toBe(120);
  expect(bytes.readUInt32BE(20)).toBe(120);
  expect(bytes.byteLength).toBeLessThan(1024 * 1024);
});

test('public branding and sign-in navigation work with the service worker active on narrow screens', async ({ page, context }) => {
  await context.route('http://localhost:10000/**', route => route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { needsSetup: false } }));
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.getByRole('link', { name: 'About PartCast', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'PartCast', exact: true })).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.addStyleTag({ content: 'body { font-size:24px; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => page.getByRole('img', { name: 'PartCast logo', exact: true }).evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: `/tmp/partcast-public-home-${width}.png`, fullPage: false });
  }
  await page.getByRole('navigation', { name: 'Public pages', exact: true }).getByRole('link', { name: 'Staff sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
});
