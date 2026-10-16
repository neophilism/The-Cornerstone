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
const consent = (page: Page) =>
  page.getByRole('checkbox', {
    name: 'I agree to send this reviewed synthetic record to my browser print dialog.',
    exact: true,
  });
const confirm = (page: Page) =>
  page.getByRole('button', { name: 'Print reviewed record', exact: true });
async function interceptPrint(page: Page) {
  await page.evaluate(() => {
    const state = window as typeof window & { printCalls: number; printedContent: string };
    state.printCalls = 0;
    window.print = () => {
      state.printCalls++;
      state.printedContent =
        document.querySelector('.reviewed-record-print pre')?.textContent || '';
    };
  });
}
test('printing requires reviewed current bytes and excludes the surrounding workspace', async ({
  page,
}, info) => {
  const { record } = await prepare(page);
  await interceptPrint(page);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.private-workspace')).toBeHidden();
  await expect(page.locator('.reviewed-record-print')).toHaveCount(0);
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Print record', exact: true }).click();
  await expect(confirm(page)).toBeDisabled();
  await consent(page).check();
  await capture(page, 'private-print-review-' + info.project.name);
  await confirm(page).click();
  await expect(consent(page)).not.toBeChecked();
  expect(await page.evaluate(() => (window as any).printCalls)).toBe(1);
  const content = await page.evaluate(() => (window as any).printedContent);
  expect(JSON.parse(content).record).toEqual(record);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.private-workspace')).toBeHidden();
  await expect(page.locator('.reviewed-record-print')).toBeVisible();
  await page.screenshot({
    path: 'test-results/private-print-output-' + info.project.name + '.png',
    fullPage: true,
  });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('.reviewed-record-print')).toHaveCount(0);
  expect(await page.locator('body').getAttribute('class')).not.toContain('cornerstone-printing');
  await page.emulateMedia({ media: 'screen' });
});
test('printing rechecks permission and requires renewed consent after a saved change', async ({
  page,
}) => {
  const { record, input, endpoint } = await prepare(page);
  await interceptPrint(page);
  await page.getByRole('button', { name: 'Print record', exact: true }).click();
  await consent(page).check();
  const me = await (await page.request.get('/api/private/me')).json();
  const changed = await page.request.post('/api/private/commands', {
    headers: { Origin: 'http://127.0.0.1:3001', 'X-CSRF-Token': me.csrf },
    data: {
      recordId: record.id,
      expectedVersion: 1,
      action: 'save_draft',
      idempotencyKey: randomUUID(),
      input: { ...input, lossDescription: 'Invented changed print details' },
    },
  });
  expect(changed.ok()).toBe(true);
  await confirm(page).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'The saved record changed. Review version 2' }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).printCalls)).toBe(0);
  await expect(consent(page)).not.toBeChecked();
  await consent(page).check();
  await page.route(endpoint, (route) =>
    route.fulfill({ status: 403, json: { message: 'Invented access revoked' } }),
  );
  await confirm(page).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No file was exported.' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).printCalls)).toBe(0);
});
test('cancelling a held print verification suppresses its late print dialog', async ({ page }) => {
  const { endpoint } = await prepare(page);
  await interceptPrint(page);
  await page.getByRole('button', { name: 'Print record', exact: true }).click();
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
  await confirm(page).click();
  await requested;
  await page.getByRole('button', { name: 'Cancel printing', exact: true }).click();
  release();
  await done;
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as any).printCalls)).toBe(0);
  await expect(page.locator('.reviewed-record-print')).toHaveCount(0);
});
