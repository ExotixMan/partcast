import { test, expect } from '@playwright/test';

const policies = [
  { path: '/privacy.html', title: 'Privacy Policy', target: 'Google and Gmail access', anchor: 'google' },
  { path: '/terms.html', title: 'Terms of Service', target: 'Records and responsibilities', anchor: 'records' }
];

test('public policies load without JavaScript, authentication or an available API', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://localhost:4173', javaScriptEnabled: false, serviceWorkers: 'block' });
  const requests = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://localhost:4173') {
      requests.push(url.origin);
      return route.abort('failed');
    }
    return route.continue();
  });
  const page = await context.newPage();
  for (const policy of policies) {
    const response = await page.goto(policy.path);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    expect(await response.text()).toContain(`<h1>${policy.title}</h1>`);
    await expect(page.getByRole('heading', { name: policy.title, exact: true })).toBeVisible();
    await expect(page).toHaveTitle(`${policy.title} | PartCast · NPG Auto Parts`);
    await expect(page.locator('time')).toHaveAttribute('datetime', '2026-10-27');
    await expect(page.getByRole('main').getByRole('link', { name: 'npgautoparts@gmail.com', exact: true }).first()).toHaveAttribute('href', /^mailto:npgautoparts@gmail\.com/);
    await page.locator('summary').click();
    await page.getByRole('complementary').getByRole('link', { name: policy.target, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${policy.path}#${policy.anchor}$`));
    await expect(page.locator(`#${policy.anchor}`)).toBeInViewport();
  }
  expect(requests).toEqual([]);
  await context.close();
});

test('sign-in links open the public policy documents with the application service worker active', async ({ page, context }) => {
  await context.route('http://localhost:10000/**', route => route.fulfill({
    headers: { 'access-control-allow-origin': '*' }, json: { needsSetup: false }
  }));
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const links = page.getByRole('navigation', { name: 'Legal information', exact: true });
  await links.getByRole('link', { name: 'Privacy Policy', exact: true }).click();
  await expect(page).toHaveURL(/\/privacy\.html$/);
  await expect(page.getByRole('heading', { name: 'Privacy Policy', exact: true })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Public pages', exact: true });
  await nav.getByRole('link', { name: 'Terms of Service', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Terms of Service', exact: true })).toBeVisible();
  await nav.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
});

test('public documents stay readable on phones and desktop with larger text, keyboard links and print', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const policy of policies) {
      await page.goto(policy.path);
      await page.addStyleTag({ content: 'body { font-size:24px; }' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByRole('heading', { name: policy.title, exact: true })).toBeInViewport();
      await expect(page.getByRole('complementary').locator('details')).not.toHaveAttribute('open');
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: `Skip to ${policy.title}`, exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`${policy.path}#main-content$`));
      for (const link of await page.getByRole('navigation', { name: 'Public pages', exact: true }).getByRole('link').all()) {
        const box = await link.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      }
      if (width === 390 || width === 1440) await page.screenshot({ path: `/tmp/partcast-${policy.title === 'Privacy Policy' ? 'privacy' : 'terms'}-${width}.png`, fullPage: false });
    }
  }
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('heading', { name: 'Terms of Service', exact: true })).toBeVisible();
  await expect(page.getByRole('complementary')).toBeHidden();
  await expect(page.locator('#contact').getByText('npgautoparts@gmail.com', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('public policies do not inspect or expose a saved staff session', async ({ page, context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('sb-ragdjkdcrvexqfadlqbf-auth-token', JSON.stringify({ access_token: 'private-test-session', user: { email: 'private-staff@example.test' } }));
  });
  const attempted = [];
  await context.route('https://*.supabase.co/**', route => { attempted.push(route.request().url()); return route.abort('failed'); });
  await context.route('http://localhost:10000/**', route => { attempted.push(route.request().url()); return route.abort('failed'); });
  for (const policy of policies) {
    await page.goto(policy.path);
    await expect(page.getByRole('heading', { name: policy.title, exact: true })).toBeVisible();
    await expect(page.getByText('private-staff@example.test', { exact: false })).toHaveCount(0);
    expect(await page.locator('body').textContent()).not.toContain('private-test-session');
  }
  expect(attempted).toEqual([]);
});
