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
async function interceptClipboard(page: Page) {
  await page.evaluate(() => {
    (window as any).copiedReferences = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as any).copiedReferences.push(value);
        },
      },
    });
  });
}
test('record reference copy rechecks access and sends only the UUID to the clipboard', async ({
  page,
}, info) => {
  const { record, endpoint } = await prepare(page);
  await interceptClipboard(page);
  const copy = page.getByRole('button', { name: 'Copy record ID', exact: true });
  await expect(page.getByText(/Clipboard history, syncing/)).toBeVisible();
  await copy.click();
  await expect(page.getByRole('status').filter({ hasText: 'Record ID copied.' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).copiedReferences)).toEqual([record.id]);
  await capture(page, 'private-reference-copy-' + info.project.name);
  await page.route(endpoint, (route) =>
    route.fulfill({ status: 403, json: { message: 'Invented revoked access' } }),
  );
  await copy.click();
  await expect(page.getByRole('status').filter({ hasText: 'Nothing was copied.' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).copiedReferences)).toEqual([record.id]);
  await expect(page.locator('.record-reference-copy .workspace-id')).toHaveCount(0);
});
test('a held reference read cannot copy after editing changes the workspace context', async ({
  page,
}) => {
  const { endpoint } = await prepare(page);
  await interceptClipboard(page);
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
  await page.getByRole('button', { name: 'Copy record ID', exact: true }).click();
  await requested;
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  release();
  await done;
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as any).copiedReferences)).toEqual([]);
  await expect(page.getByRole('button', { name: 'Copy record ID', exact: true })).toBeDisabled();
});
test('clipboard denial offers only a freshly authorized manual reference', async ({ page }) => {
  const { record } = await prepare(page);
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw Error('Invented clipboard permission denial');
        },
      },
    }),
  );
  await page.getByRole('button', { name: 'Copy record ID', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Clipboard access is unavailable.' }),
  ).toBeVisible();
  await expect(page.locator('.record-reference-copy .workspace-id')).toHaveText(record.id);
});
