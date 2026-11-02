import { test, expect } from '@playwright/test';

const project = 'ragdjkdcrvexqfadlqbf';
const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '77777777-7777-4777-8777-777777777777';
const paidId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const unpaidId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const token = `e30.${Buffer.from(JSON.stringify({ session_id: sessionId, amr: [{ method: 'password' }] })).toString('base64url')}.test-only-signature`;
const headers = { 'access-control-allow-origin': '*' };

async function balancesFixture(context) {
  await context.addInitScript(({ project, userId, token }) => {
    localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify({
      access_token: token, refresh_token: 'test-only-refresh', expires_at: 4102444800,
      expires_in: 3600, token_type: 'bearer',
      user: { id: userId, email: 'owner@example.test', aud: 'authenticated' }
    }));
  }, { project, userId, token });
  const debts = [
    { id: paidId, customer_name: 'Aling Nena', principal: 100, paid_amount: 100, balance: 0, status: 'paid', reference_no: 'PAID-100', phone: '09171234567', notes: 'Paid in full at the counter.' },
    { id: unpaidId, customer_name: 'Mang Ben', principal: 200, paid_amount: 0, balance: 200, status: 'overdue', due_date: '2026-01-01' }
  ];
  const payments = [], receipts = new Map();
  await context.route('http://localhost:10000/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: {
      ...headers, 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'authorization,content-type'
    } });
    let body = { data: [] };
    if (path === '/api/me') body = { user: { id: userId, full_name: 'Store Owner', role: 'owner', active: true, session_id: sessionId, verification_expires_at: '2099-01-01T00:00:00Z' } };
    else if (path === '/api/offline-snapshot') body = { products: [], suppliers: [] };
    else if (path === '/api/debts') body = { data: debts };
    else if (path === '/api/debts/payment') {
      const payment = request.postDataJSON();
      if (!receipts.has(payment.client_operation_id)) {
        payments.push({ ...payment, id: `payment-${payments.length + 1}`, paid_at: payment.occurred_at });
        const debt = debts.find(row => row.id === payment.debt_id);
        debt.paid_amount += payment.amount;
        debt.balance -= payment.amount;
        debt.status = debt.balance ? 'overdue' : 'paid';
        receipts.set(payment.client_operation_id, { balance: debt.balance });
      }
      body = receipts.get(payment.client_operation_id);
    } else if (path.endsWith('/payments')) {
      const debtId = path.split('/').at(-2);
      body = { data: payments.filter(payment => payment.debt_id === debtId) };
    }
    await route.fulfill({ json: body, headers });
  });
  return { debts, payments };
}

const customerCard = (page, name) => page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });

test('paid customers appear in default search while extra balance details stay collapsed', async ({ page, context }) => {
  await balancesFixture(context);
  await page.goto('/debts');
  await expect(page.getByLabel('Show balances')).toHaveValue('all');
  await page.getByLabel('Find a customer').fill('  ALING NENA  ');
  const paid = customerCard(page, 'Aling Nena');
  await expect(paid).toBeVisible();
  await expect(paid.getByText('Fully paid', { exact: true })).toBeVisible();
  await expect(customerCard(page, 'Mang Ben')).toHaveCount(0);
  await expect(paid.getByText('PAID-100')).not.toBeVisible();
  await expect(paid.getByText('Paid in full at the counter.')).not.toBeVisible();
  await paid.getByText('Balance details', { exact: true }).click();
  await expect(paid.getByText('PAID-100')).toBeVisible();
  await expect(paid.getByText('Paid in full at the counter.')).toBeVisible();
  await expect(paid.getByRole('button', { name: 'View payments' })).toBeVisible();
  await expect(paid.getByRole('button', { name: 'Record payment' })).toHaveCount(0);
});

test('status filters stay explicit and an empty customer search can clear them on a phone', async ({ page, context }) => {
  await balancesFixture(context);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/debts');
  await page.getByLabel('Show balances').selectOption('unpaid');
  await expect(customerCard(page, 'Mang Ben')).toBeVisible();
  await page.getByLabel('Find a customer').fill('Aling Nena');
  await expect(page.getByText('No matching customer balances.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Show balances')).toHaveValue('unpaid');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.getByLabel('Find a customer')).toHaveValue('');
  await expect(page.getByLabel('Show balances')).toHaveValue('all');
  await expect(customerCard(page, 'Aling Nena')).toBeVisible();
  await expect(customerCard(page, 'Mang Ben')).toBeVisible();
  await page.getByLabel('Show balances').selectOption('paid');
  await expect(customerCard(page, 'Aling Nena')).toBeVisible();
  await expect(customerCard(page, 'Mang Ben')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a fully paid balance remains visible with its payment history after saving', async ({ page, context }) => {
  const api = await balancesFixture(context);
  await page.goto('/debts');
  await customerCard(page, 'Mang Ben').getByRole('button', { name: 'Record payment' }).click();
  await page.getByLabel('Amount received').fill('200');
  await page.getByRole('button', { name: 'Save payment', exact: true }).click();
  await expect.poll(() => api.payments.length).toBe(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const paid = customerCard(page, 'Mang Ben');
  await expect(paid).toBeVisible();
  await expect(paid.getByText('Fully paid', { exact: true })).toBeVisible();
  await expect(paid.getByRole('button', { name: 'Record payment' })).toHaveCount(0);
  await paid.getByRole('button', { name: 'View payments' }).click();
  await expect(page.getByRole('dialog')).toContainText('200.00');
  await expect(page.getByRole('dialog')).toContainText('Mang Ben');
});

test('a payment in another tab updates the open payment limit without losing its draft',async({page,context})=>{
  const store=await balancesFixture(context);await page.goto('/debts');
  await customerCard(page,'Mang Ben').getByRole('button',{name:'Record payment'}).click();
  const amount=page.getByLabel('Amount received');await amount.fill('150');
  const other=await context.newPage();await other.goto('/debts');
  await customerCard(other,'Mang Ben').getByRole('button',{name:'Record payment'}).click();
  await other.getByLabel('Amount received').fill('100');await other.getByRole('button',{name:'Save payment',exact:true}).click();
  await expect(amount).toHaveAttribute('max','100');await expect(amount).toHaveValue('150');
  await page.getByRole('button',{name:'Save payment',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('100');expect(store.payments).toHaveLength(1);
  await amount.fill('100');await page.getByRole('button',{name:'Save payment',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);expect(store.payments).toHaveLength(2);
  await expect(customerCard(page,'Mang Ben')).toContainText('Fully paid');
});

test('customer balances use English labels and recommend names after the first letter',async({page,context})=>{
 const store=await balancesFixture(context);
 store.debts.push({id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',customer_name:'Alex',principal:10,paid_amount:0,balance:10,status:'open'},
 {id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',customer_name:'Alarcon',principal:20,paid_amount:0,balance:20,status:'open'});
 await page.goto('/debts');await expect(page.getByRole('heading',{name:'Customer balances',exact:true})).toBeVisible();
 await expect(page.locator('body')).not.toContainText(/\butang\b/i);
 const search=page.getByRole('combobox',{name:'Find a customer',exact:true});await search.fill('A');
 await expect(page.getByRole('option',{name:'Alex',exact:true})).toBeVisible();await expect(page.getByRole('option',{name:'Alarcon',exact:true})).toBeVisible();
 await page.getByRole('option',{name:'Alarcon',exact:true}).click();await expect(search).toHaveValue('Alarcon');
 await expect(page.getByRole('heading',{name:'Alarcon',exact:true})).toBeVisible();
});
