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

test('a committed lost workflow response and denied retry preserve one exact action', async ({
  page,
}, info) => {
  const record = await prepare(page);
  const wires: string[] = [];
  let accepted: any;
  await page.route('**/api/private/commands', async (route) => {
    if (route.request().postDataJSON().recordId !== record.id) return route.continue();
    wires.push(route.request().postData()!);
    if (wires.length === 2)
      return route.fulfill({
        status: 403,
        json: { code: 'DENIED', message: 'Synthetic retry denial' },
      });
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    if (wires.length === 1) {
      accepted = await response.json();
      return route.abort('failed');
    }
    await route.fulfill({ response });
  });
  const submit = page.getByRole('button', { name: 'Mark preparation complete', exact: true });
  await submit.click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'The action outcome is unknown.' }),
  ).toBeVisible();
  await expect(submit).toBeDisabled();
  await page.getByRole('button', { name: 'Retry exact action', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'The action outcome is unknown.' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry exact action', exact: true })).toBeEnabled();
  await expect(submit).toBeDisabled();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry exact action', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Your next step, made clear.', exact: true }),
  ).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({
    path: `test-results/private-action-recovery-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Retry exact action', exact: true }).click();
  await expect(page.getByText('Simulation receipt · version 2', { exact: true })).toBeVisible();
  expect(wires).toHaveLength(3);
  expect(new Set(wires).size).toBe(1);
  expect(accepted.record.version).toBe(2);
  const current = await (
    await page.request.get('/api/private/records?recordId=' + record.id)
  ).json();
  expect(current.records[0].version).toBe(2);
  expect(current.records[0].state).toBe('ready');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test('an uncorrelated success response cannot clear workflow recovery', async ({ page }) => {
  const record = await prepare(page);
  let first = true;
  await page.route('**/api/private/commands', async (route) => {
    if (route.request().postDataJSON().recordId !== record.id) return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    if (first) {
      first = false;
      body.receipt.recordId = randomUUID();
      return route.fulfill({ status: 200, json: body });
    }
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Mark preparation complete', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'The action outcome is unknown.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry exact action', exact: true }).click();
  await expect(page.getByText('Simulation receipt · version 2', { exact: true })).toBeVisible();
});

test('a recovered historical action does not replace a newer workflow state', async ({ page }) => {
  const record = await prepare(page);
  let lost = true;
  await page.route('**/api/private/commands', async (route) => {
    const request = route.request().postDataJSON();
    if (request.recordId !== record.id || request.action !== 'mark_ready') return route.continue();
    const response = await route.fetch();
    if (lost) {
      lost = false;
      return route.abort('failed');
    }
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Mark preparation complete', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry exact action', exact: true })).toBeVisible();
  const me = await (await page.request.get('/api/private/me')).json();
  const newer = await page.request.post('/api/private/commands', {
    headers: { Origin: 'http://127.0.0.1:3001', 'X-CSRF-Token': me.csrf },
    data: {
      recordId: record.id,
      action: 'reopen',
      expectedVersion: 2,
      input: {},
      idempotencyKey: randomUUID(),
    },
  });
  expect(newer.ok()).toBe(true);
  await page.getByRole('button', { name: 'Retry exact action', exact: true }).click();
  await expect(page.getByText('Simulation receipt · version 2', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Mark preparation complete', exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Continue preparing', exact: true })).toHaveCount(
    0,
  );
  const updated = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/private/commands') && r.request().postDataJSON().expectedVersion === 3,
  );
  await page.getByRole('button', { name: 'Mark preparation complete', exact: true }).click();
  expect((await updated).ok()).toBe(true);
  await expect(page.getByText('Simulation receipt · version 4', { exact: true })).toBeVisible();
});
