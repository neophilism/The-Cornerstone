import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const exportButton = (page: Page) =>
  page.getByRole('button', { name: 'Export record', exact: true });
const downloadButton = (page: Page) =>
  page.getByRole('button', { name: 'Download reviewed record', exact: true });
const consent = (page: Page) =>
  page.getByRole('checkbox', {
    name: 'I agree to save this unencrypted synthetic record file on this device.',
    exact: true,
  });
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
  const { record } = await (await response).json();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  return { record, input, endpoint: '**/api/private/records?recordId=' + record.id };
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
test('record export requires exact-version consent and rechecks concurrent saved changes', async ({
  page,
}, info) => {
  const { record, input } = await prepare(page);
  let count = 0;
  page.on('download', () => count++);
  await exportButton(page).click();
  await expect(consent(page)).toBeVisible();
  await expect(downloadButton(page)).toBeDisabled();
  await consent(page).check();
  await capture(page, 'private-record-export-review-' + info.project.name);
  const first = page.waitForEvent('download');
  await downloadButton(page).click();
  const downloaded = await first;
  expect(downloaded.suggestedFilename()).toBe('cornerstone-synthetic-record.json');
  const original = JSON.parse(await readFile((await downloaded.path())!, 'utf8'));
  expect(original.format).toBe('cornerstone-synthetic-record/v1');
  expect(original.record).toEqual(record);
  await expect(consent(page)).not.toBeChecked();
  await consent(page).check();
  const me = await (await page.request.get('/api/private/me')).json();
  const saved = await page.request.post('/api/private/commands', {
    headers: { Origin: 'http://127.0.0.1:3001', 'X-CSRF-Token': me.csrf },
    data: {
      recordId: record.id,
      expectedVersion: 1,
      action: 'save_draft',
      idempotencyKey: randomUUID(),
      input: { ...input, livelihood: 'Invented saved revision for export' },
    },
  });
  expect(saved.ok()).toBe(true);
  await downloadButton(page).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'The saved record changed. Review version 2' }),
  ).toBeVisible();
  expect(count).toBe(1);
  await expect(consent(page)).not.toBeChecked();
  await expect(downloadButton(page)).toBeDisabled();
  await capture(page, 'private-record-export-changed-' + info.project.name);
  await consent(page).check();
  const second = page.waitForEvent('download');
  await downloadButton(page).click();
  const latest = JSON.parse(await readFile((await (await second).path())!, 'utf8'));
  expect(latest.record.version).toBe(2);
  expect(latest.record.data.livelihood).toBe('Invented saved revision for export');
  expect(count).toBe(2);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});
test('denied or malformed current access never exports cached record contents', async ({
  page,
}) => {
  const { endpoint, record } = await prepare(page);
  let count = 0;
  page.on('download', () => count++);
  await exportButton(page).click();
  await consent(page).check();
  await page.route(endpoint, (route) =>
    route.fulfill({ status: 403, json: { message: 'Invented access revoked' } }),
  );
  await downloadButton(page).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No file was exported.' })).toBeVisible();
  await expect(consent(page)).toHaveCount(0);
  expect(count).toBe(0);
  await page.unroute(endpoint);
  await page.route(endpoint, (route) =>
    route.fulfill({ status: 200, json: { records: [{ id: record.id }] } }),
  );
  await page.getByRole('button', { name: 'Check access again', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No file was exported.' })).toBeVisible();
  await expect(downloadButton(page)).toHaveCount(0);
  expect(count).toBe(0);
});
test('cancelling a held export suppresses its late download', async ({ page }) => {
  const { endpoint } = await prepare(page);
  let count = 0;
  page.on('download', () => count++);
  await exportButton(page).click();
  await consent(page).check();
  let release!: () => void, observed!: () => void, settled!: () => void;
  const held = new Promise<void>((r) => (release = r));
  const requested = new Promise<void>((r) => (observed = r));
  const done = new Promise<void>((r) => (settled = r));
  await page.route(endpoint, async (route) => {
    const response = await route.fetch();
    observed();
    await held;
    try {
      await route.fulfill({ response });
    } catch {
      /* Navigation may abort. */
    } finally {
      settled();
    }
  });
  await downloadButton(page).click();
  await requested;
  await page.getByRole('button', { name: 'Cancel export', exact: true }).click();
  release();
  await done;
  await page.waitForTimeout(150);
  expect(count).toBe(0);
  await expect(exportButton(page)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Review record export', exact: true }),
  ).toHaveCount(0);
});
test('opening an editor clears export consent and does not export unsaved input', async ({
  page,
}) => {
  await prepare(page);
  await exportButton(page).click();
  await consent(page).check();
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await expect(consent(page)).toHaveCount(0);
  await expect(exportButton(page)).toBeDisabled();
  await page.getByLabel('Direct loss', { exact: true }).fill('Unsaved invented loss');
  await page.getByRole('button', { name: 'Cancel editing', exact: true }).click();
  await expect(exportButton(page)).toBeEnabled();
  await exportButton(page).click();
  await expect(consent(page)).not.toBeChecked();
});
test('session expiry during final export verification clears private review state', async ({
  page,
}) => {
  const { endpoint } = await prepare(page);
  let count = 0;
  page.on('download', () => count++);
  await exportButton(page).click();
  await consent(page).check();
  await page.route(endpoint, (route) =>
    route.fulfill({ status: 401, contentType: 'text/html', body: 'Expired synthetic session' }),
  );
  await downloadButton(page).click();
  await expect(
    page.getByRole('heading', { name: 'Your private workspace.', exact: true }),
  ).toBeVisible();
  await expect(consent(page)).toHaveCount(0);
  expect(count).toBe(0);
});
