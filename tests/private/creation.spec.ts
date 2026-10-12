import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
async function prepare(page: Page, label: string) {
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
  const title = 'Invented creation ' + label + ' ' + randomUUID();
  await page.getByLabel('Record title', { exact: true }).fill(title);
  await page.getByLabel('Government action', { exact: true }).fill('Invented creation action');
  await page
    .getByLabel('Established livelihood', { exact: true })
    .fill('Invented creation livelihood');
  await page.getByLabel('Direct loss', { exact: true }).fill('Invented creation loss');
  return title;
}
const creationAlert = (page: Page) =>
  page.getByRole('region', { name: 'Prepare your new record', exact: true }).getByRole('alert');
const endpoint = '**/api/private/records';
const save = (page: Page) =>
  page.getByRole('button', { name: 'Save synthetic draft', exact: true });
const retry = (page: Page) =>
  page.getByRole('button', { name: 'Retry exact creation', exact: true });
async function onlyOne(page: Page, title: string, id: string) {
  const response = await page.request.get('/api/private/records?limit=200');
  expect(response.ok()).toBe(true);
  const { records } = await response.json();
  expect(
    records
      .filter((record: { title: string }) => record.title === title)
      .map((record: { id: string }) => record.id),
  ).toEqual([id]);
}
async function accessibleCapture(page: Page, name: string) {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map((item) => item.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/' + name + '.png', fullPage: true });
}
test('a committed lost response and denied retry keep one immutable creation intent', async ({
  page,
}, info) => {
  const title = await prepare(page, info.project.name);
  const wires: string[] = [];
  let id = '';
  await page.route(endpoint, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    wires.push(route.request().postData()!);
    if (wires.length === 2)
      return route.fulfill({
        status: 403,
        json: { code: 'FORBIDDEN', message: 'Synthetic retry denied' },
      });
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    id = (await response.json()).record.id;
    if (wires.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await save(page).click();
  await expect(creationAlert(page)).toContainText('Creation is unconfirmed.');
  await expect(page.getByLabel('Record title', { exact: true })).toBeDisabled();
  await expect(save(page)).toBeDisabled();
  await retry(page).click();
  await expect(creationAlert(page)).toContainText('Creation is unconfirmed.');
  await expect(page.getByLabel('Direct loss', { exact: true })).toBeDisabled();
  await accessibleCapture(page, 'private-creation-uncertain-' + info.project.name);
  await retry(page).click();
  await expect(
    page.getByText('Simulation receipt \u00b7 version 1', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  expect(wires).toHaveLength(3);
  expect(new Set(wires).size).toBe(1);
  await onlyOne(page, title, id);
  await accessibleCapture(page, 'private-creation-recovered-' + info.project.name);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});
test('a malformed success after commit stays frozen until its original receipt is recovered', async ({
  page,
}, info) => {
  const title = await prepare(page, 'malformed ' + info.project.name);
  const wires: string[] = [];
  let id = '';
  await page.route(endpoint, async (route) => {
    wires.push(route.request().postData()!);
    const response = await route.fetch();
    id = (await response.json()).record.id;
    if (wires.length === 1) return route.fulfill({ status: 200, json: { record: { id } } });
    await route.fulfill({ response });
  });
  await save(page).click();
  await expect(creationAlert(page)).toContainText('Creation is unconfirmed.');
  await expect(save(page)).toBeDisabled();
  await retry(page).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  expect(wires).toHaveLength(2);
  expect(wires[1]).toBe(wires[0]);
  await onlyOne(page, title, id);
});
test('a definite first rejection preserves editable input without claiming a saved record', async ({
  page,
}, info) => {
  await prepare(page, 'rejection ' + info.project.name);
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 422,
      json: { code: 'INVALID', message: 'Synthetic fields need correction' },
    }),
  );
  await save(page).click();
  await expect(creationAlert(page)).toContainText('Synthetic fields need correction');
  await expect(page.getByLabel('Direct loss', { exact: true })).toHaveValue(
    'Invented creation loss',
  );
  await expect(save(page)).toBeEnabled();
  await expect(retry(page)).toHaveCount(0);
  await expect(page.getByText('Simulation receipt \u00b7 version 1', { exact: true })).toHaveCount(
    0,
  );
  await page.unroute(endpoint);
  const title = 'Invented corrected creation ' + randomUUID();
  await page.getByLabel('Record title', { exact: true }).fill(title);
  await save(page).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
});
test('a late committed creation response cannot reopen a cancelled form', async ({
  page,
}, info) => {
  const title = await prepare(page, 'late ' + info.project.name);
  let release!: () => void;
  let observed!: () => void;
  let settled!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const requested = new Promise<void>((resolve) => (observed = resolve));
  const done = new Promise<void>((resolve) => (settled = resolve));
  let id = '';
  await page.route(endpoint, async (route) => {
    const response = await route.fetch();
    id = (await response.json()).record.id;
    observed();
    await held;
    try {
      await route.fulfill({ response });
    } catch {
      /* Navigation may abort a request. */
    } finally {
      settled();
    }
  });
  await save(page).click();
  await requested;
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  release();
  await done;
  await expect(
    page.getByRole('heading', { name: 'Prepare your new record', exact: true }),
  ).toHaveCount(0);
  await page.waitForTimeout(150);
  await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
  await expect(page.getByText('Simulation receipt \u00b7 version 1', { exact: true })).toHaveCount(
    0,
  );
  await onlyOne(page, title, id);
});
test('session expiry clears an unconfirmed creation even with a non-JSON denial', async ({
  page,
}, info) => {
  await prepare(page, 'expiry ' + info.project.name);
  await page.route(endpoint, (route) =>
    route.fulfill({ status: 401, contentType: 'text/html', body: '<p>Session expired</p>' }),
  );
  await save(page).click();
  await expect(
    page.getByRole('heading', { name: 'Your private workspace.', exact: true }),
  ).toBeVisible();
  await expect(retry(page)).toHaveCount(0);
  await expect(page.getByLabel('Record title', { exact: true })).toHaveCount(0);
});
