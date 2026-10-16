import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
async function prepare(page: Page) {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'participant \u00b7 synthetic development', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Your next step, made clear.' })).toBeVisible();
  await page
    .locator('.workflow-card')
    .filter({ has: page.getByRole('heading', { name: 'Preparation dossier', exact: true }) })
    .getByRole('button', { name: 'Start draft', exact: true })
    .click();
  const title = 'Invented reviewed export ' + randomUUID();
  await page.getByLabel('Record title', { exact: true }).fill(title);
  const input = {
    actionDescription: 'Invented export action',
    livelihood: 'Invented export livelihood',
    lossDescription: 'Invented export loss',
  };
  await page.getByLabel('Government action', { exact: true }).fill(input.actionDescription);
  await page.getByLabel('Established livelihood', { exact: true }).fill(input.livelihood);
  await page.getByLabel('Direct loss', { exact: true }).fill(input.lossDescription);
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/private/records') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
  const { record, receipt } = await (await response).json();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  return { record, receipt, endpoint: '**/api/private/receipts?receiptId=' + receipt.id };
}
async function capture(page: Page, name: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations.map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/' + name + '.png', fullPage: true });
}
const reviewButton = (page: Page) =>
  page.getByRole('button', { name: 'Download receipt', exact: true });
const downloadButton = (page: Page) =>
  page.getByRole('button', { name: 'Download reviewed receipt', exact: true });
const consent = (page: Page) =>
  page.getByRole('checkbox', {
    name: 'I agree to save this unencrypted synthetic receipt file on this device.',
    exact: true,
  });
test('receipt review exports only consented historical bytes after a fresh authenticated read', async ({
  page,
}, info) => {
  const { receipt, record } = await prepare(page);
  let reads = 0,
    downloads = 0;
  page.on('request', (r) => {
    if (r.url().includes('/api/private/receipts?')) reads++;
  });
  page.on('download', () => downloads++);
  await reviewButton(page).click();
  await expect(downloadButton(page)).toBeDisabled();
  await consent(page).check();
  await capture(page, 'private-receipt-review-' + info.project.name);
  const pending = page.waitForEvent('download');
  await downloadButton(page).click();
  const downloaded = await pending;
  const value = JSON.parse(await readFile((await downloaded.path())!, 'utf8'));
  expect(value.receipt).toEqual(receipt);
  expect(value.format).toBe('cornerstone-synthetic-receipt/v1');
  expect(JSON.stringify(value)).not.toContain(record.data.lossDescription);
  expect(downloaded.suggestedFilename()).toBe('cornerstone-simulation-receipt.json');
  expect(reads).toBe(2);
  expect(downloads).toBe(1);
  await expect(consent(page)).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});
test('denied access and a substituted receipt never release cached download bytes', async ({
  page,
}) => {
  const { endpoint, receipt } = await prepare(page);
  let downloads = 0;
  page.on('download', () => downloads++);
  await reviewButton(page).click();
  await consent(page).check();
  await page.route(endpoint, (route) =>
    route.fulfill({ status: 403, json: { message: 'Invented revoked access' } }),
  );
  await downloadButton(page).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No file was exported.' })).toBeVisible();
  await expect(consent(page)).toHaveCount(0);
  await page.unroute(endpoint);
  await page.route(endpoint, (route) =>
    route.fulfill({ status: 200, json: { receipt: { ...receipt, recordId: randomUUID() } } }),
  );
  await page.getByRole('button', { name: 'Check receipt access again', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No file was exported.' })).toBeVisible();
  expect(downloads).toBe(0);
});
test('dismissal cancels a held receipt export and suppresses the late response', async ({
  page,
}) => {
  const { endpoint } = await prepare(page);
  let downloads = 0;
  page.on('download', () => downloads++);
  await reviewButton(page).click();
  await consent(page).check();
  let release!: () => void, observed!: () => void, settled!: () => void;
  const held = new Promise<void>((r) => (release = r)),
    requested = new Promise<void>((r) => (observed = r)),
    done = new Promise<void>((r) => (settled = r));
  await page.route(endpoint, async (route) => {
    const response = await route.fetch();
    observed();
    await held;
    try {
      await route.fulfill({ response });
    } finally {
      settled();
    }
  });
  await downloadButton(page).click();
  await requested;
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  release();
  await done;
  await page.waitForTimeout(150);
  expect(downloads).toBe(0);
  await expect(
    page.getByRole('heading', { name: 'Review receipt export', exact: true }),
  ).toHaveCount(0);
});
test('session expiry during receipt verification clears private state without a download', async ({
  page,
}) => {
  const { endpoint } = await prepare(page);
  let downloads = 0;
  page.on('download', () => downloads++);
  await reviewButton(page).click();
  await consent(page).check();
  await page.route(endpoint, (route) =>
    route.fulfill({ status: 401, contentType: 'text/html', body: 'Expired synthetic session' }),
  );
  await downloadButton(page).click();
  await expect(
    page.getByRole('heading', { name: 'Your private workspace.', exact: true }),
  ).toBeVisible();
  expect(downloads).toBe(0);
  await expect(consent(page)).toHaveCount(0);
});
