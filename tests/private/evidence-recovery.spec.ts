import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';

async function prepare(page: Page) {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'participant · synthetic development', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Your next step, made clear.' })).toBeVisible();
  await page
    .locator('.workflow-card')
    .filter({ has: page.getByRole('heading', { name: 'Preparation dossier', exact: true }) })
    .getByRole('button', { name: 'Start draft', exact: true })
    .click();
  await page
    .getByLabel('Record title', { exact: true })
    .fill('Invented action recovery ' + randomUUID());
  await page.getByLabel('Government action', { exact: true }).fill('Invented recovery action');
  await page
    .getByLabel('Established livelihood', { exact: true })
    .fill('Invented recovery livelihood');
  await page.getByLabel('Direct loss', { exact: true }).fill('Invented recovery loss');
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/api/private/records') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
  const { record } = await (await saved).json();
  await expect(page.getByText('Simulation receipt · version 1', { exact: true })).toBeVisible();
  return record;
}

async function attach(page: Page) {
  await page.getByText('Attach a synthetic text file', { exact: true }).click();
  await page.getByLabel('Synthetic text file', { exact: true }).setInputFiles({
    name: 'recovery.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Invented recovery attachment bytes'),
  });
  await page
    .getByLabel('What this item shows', { exact: true })
    .fill('Invented attachment recovery metadata');
  await page
    .getByLabel('I am using invented development information only.', { exact: true })
    .check();
  await page.getByRole('button', { name: 'Save quarantined attachment', exact: true }).click();
}
test('lost upload response and denied retry preserve exactly one attachment and frozen input', async ({
  page,
}, info) => {
  const record = await prepare(page),
    wires: string[] = [];
  await page.route('**/api/private/evidence/upload', async (route) => {
    wires.push(route.request().postData()!);
    if (wires.length === 2)
      return route.fulfill({ status: 403, json: { message: 'Invented retry denial' } });
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    if (wires.length === 1) return route.abort('failed');
    await route.fulfill({ response });
  });
  await attach(page);
  const retry = page.getByRole('button', { name: 'Retry exact evidence action', exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByLabel('What this item shows', { exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Mark preparation complete', exact: true }),
  ).toBeDisabled();
  await retry.click();
  await expect(retry).toBeEnabled();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(retry).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({
    path: 'test-results/private-evidence-recovery-' + info.project.name + '.png',
    fullPage: true,
  });
  await retry.click();
  await expect(page.getByText('Simulation receipt · version 2', { exact: true })).toBeVisible();
  await expect(page.locator('.evidence-card')).toHaveCount(1);
  expect(wires).toHaveLength(3);
  expect(new Set(wires).size).toBe(1);
  const saved = await (await page.request.get('/api/private/records?recordId=' + record.id)).json();
  expect(saved.records[0].version).toBe(2);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});
test('mismatched validation response remains recoverable and reloads current attachment state', async ({
  page,
}) => {
  await prepare(page);
  await attach(page);
  await expect(page.getByText('Simulation receipt · version 2', { exact: true })).toBeVisible();
  let first = true;
  const wires: string[] = [];
  await page.route('**/api/private/evidence/validate', async (route) => {
    wires.push(route.request().postData()!);
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    if (first) {
      first = false;
      const body = await response.json();
      body.receipt.recordId = randomUUID();
      return route.fulfill({ status: 200, json: body });
    }
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Validate synthetic text', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'The evidence outcome is unknown.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry exact evidence action', exact: true }).click();
  await expect(page.getByText('Simulation receipt · version 3', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Download synthetic text', exact: true }),
  ).toBeVisible();
  expect(wires).toHaveLength(2);
  expect(new Set(wires).size).toBe(1);
});
