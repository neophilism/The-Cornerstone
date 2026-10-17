import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { Simulation } from '../helpers/simulation.js';
async function prepare(page: Page) {
  const world = await new Simulation().connect();
  try {
    const person = await world.persona('participant'),
      title = 'Invented evidence download ' + randomUUID();
    const record = await world.create(person, 'dossier', title, {
      actionDescription: 'Invented action',
      livelihood: 'Invented livelihood',
      lossDescription: 'Invented loss',
    });
    const evidenceId = await world.attach(person, record);
    await page.goto('/');
    await page
      .getByRole('button', { name: 'participant · synthetic development', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Your next step, made clear.', exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'My records', exact: true }).click();
    await page
      .locator('.task-card')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
      .getByRole('button', { name: 'Open', exact: true })
      .click();
    const card = page.locator('.evidence-card');
    await expect(
      card.getByRole('button', { name: 'Download synthetic text', exact: true }),
    ).toBeVisible();
    return { record, evidenceId, card };
  } finally {
    await world.close();
  }
}
const consent = (page: Page) =>
  page.getByLabel('I agree to save this unencrypted synthetic text file on this device.', {
    exact: true,
  });
test('an attachment requires explicit disclosure consent and current exact bytes before download', async ({
  page,
}, info) => {
  const { card, record } = await prepare(page);
  let reads = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/evidence?recordId=' + record.id)) reads++;
  });
  await card.getByRole('button', { name: 'Download synthetic text', exact: true }).click();
  await expect(
    card.getByRole('button', { name: 'Download reviewed text', exact: true }),
  ).toBeDisabled();
  await consent(page).check();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({
    path: 'test-results/private-evidence-download-' + info.project.name + '.png',
    fullPage: true,
  });
  const event = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Download reviewed text', exact: true }).click();
  const download = await event;
  expect(download.suggestedFilename()).toBe('invented-support.txt');
  expect(await readFile((await download.path())!, 'utf8')).toBe(
    'Invented test evidence only. No real person or finding.',
  );
  expect(reads).toBe(2);
  await expect(consent(page)).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});
test('changed attachment bytes and revoked metadata access cannot release a cached file', async ({
  page,
}) => {
  const { card, record, evidenceId } = await prepare(page);
  let downloads = 0;
  page.on('download', () => downloads++);
  await card.getByRole('button', { name: 'Download synthetic text', exact: true }).click();
  await consent(page).check();
  await page.route('**/api/private/evidence/download?id=' + evidenceId, (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: 'Substituted content' }),
  );
  await card.getByRole('button', { name: 'Download reviewed text', exact: true }).click();
  await expect(card.getByRole('alert')).toContainText('No file was prepared');
  await expect(consent(page)).not.toBeChecked();
  await page.route('**/api/private/evidence?recordId=' + record.id, (route) =>
    route.fulfill({ status: 403, json: { message: 'Synthetic current access denied' } }),
  );
  await consent(page).check();
  await card.getByRole('button', { name: 'Download reviewed text', exact: true }).click();
  await expect(card.getByRole('alert')).toContainText('No file was prepared');
  expect(downloads).toBe(0);
});
test('cancelling a held attachment response prevents a later download', async ({ page }) => {
  const { card, evidenceId } = await prepare(page);
  let downloads = 0;
  page.on('download', () => downloads++);
  let release!: () => void, arrived!: () => void;
  const held = new Promise<void>((resolve) => {
      release = resolve;
    }),
    fetched = new Promise<void>((resolve) => {
      arrived = resolve;
    });
  await page.route('**/api/private/evidence/download?id=' + evidenceId, async (route) => {
    const response = await route.fetch();
    arrived();
    await held;
    await route.fulfill({ response }).catch(() => undefined);
  });
  await card.getByRole('button', { name: 'Download synthetic text', exact: true }).click();
  await consent(page).check();
  await card.getByRole('button', { name: 'Download reviewed text', exact: true }).click();
  await fetched;
  await card.getByRole('button', { name: 'Cancel attachment download', exact: true }).click();
  release();
  await expect(
    card.getByRole('button', { name: 'Download synthetic text', exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(200);
  expect(downloads).toBe(0);
});

async function expireSession(page: Page, csrf: string) {
  const result = await page.request.post('/api/private/auth/logout', {
    headers: { Origin: 'http://127.0.0.1:3001', 'X-CSRF-Token': csrf },
    data: {},
  });
  expect(result.status()).toBe(200);
}

test('a final attachment 401 clears the private workspace before handling a non-JSON body', async ({
  page,
}, info) => {
  const { card, record, evidenceId } = await prepare(page);
  const me = await (await page.request.get('/api/private/me')).json();
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.route('**/api/private/evidence/download?id=' + evidenceId, async (route) => {
    await expireSession(page, me.csrf);
    const response = await route.fetch();
    expect(response.status()).toBe(401);
    await route.fulfill({
      status: 401,
      contentType: 'text/html',
      body: 'Expired synthetic session',
    });
  });
  await card.getByRole('button', { name: 'Download synthetic text', exact: true }).click();
  await consent(page).check();
  await card.getByRole('button', { name: 'Download reviewed text', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your private workspace.', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.record-view')).toHaveCount(0);
  await expect(page.getByText(record.title, { exact: true })).toHaveCount(0);
  await expect(page.locator('.evidence-download-review')).toHaveCount(0);
  expect(downloads).toBe(0);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await page.screenshot({
    path: 'test-results/private-evidence-session-expired-' + info.project.name + '.png',
    fullPage: true,
  });
});

for (const expired of [false, true])
  test(
    'an earlier attachment ' +
      (expired ? '401' : 'successful response') +
      ' cannot expire a new sign-in or release a file',
    async ({ page }) => {
      const { card, record, evidenceId } = await prepare(page);
      const me = await (await page.request.get('/api/private/me')).json();
      let downloads = 0;
      page.on('download', () => downloads++);
      // Deliver this one response even after the component aborts its request. This
      // exercises the session boundary independently of transport cancellation.
      await page.evaluate(() => {
        const original = window.fetch.bind(window);
        window.fetch = (input, init) => {
          const url =
            typeof input === 'string' ? input : input instanceof Request ? input.url : input.href;
          if (new URL(url, location.href).pathname === '/api/private/evidence/download') {
            window.fetch = original;
            return original(input, { ...init, signal: undefined });
          }
          return original(input, init);
        };
      });
      let release!: () => void, observed!: () => void, settled!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const requested = new Promise<void>((resolve) => (observed = resolve));
      const done = new Promise<void>((resolve) => (settled = resolve));
      await page.route('**/api/private/evidence/download?id=' + evidenceId, async (route) => {
        if (expired) await expireSession(page, me.csrf);
        const response = await route.fetch();
        expect(response.status()).toBe(expired ? 401 : 200);
        observed();
        await held;
        try {
          if (expired)
            await route.fulfill({
              status: 401,
              contentType: 'text/html',
              body: 'Expired earlier synthetic session',
            });
          else await route.fulfill({ response });
        } finally {
          settled();
        }
      });
      await card.getByRole('button', { name: 'Download synthetic text', exact: true }).click();
      await consent(page).check();
      await card.getByRole('button', { name: 'Download reviewed text', exact: true }).click();
      await requested;
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Your private workspace.', exact: true }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'successor · synthetic development', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Your next step, made clear.', exact: true }),
      ).toBeVisible();
      const current = await (await page.request.get('/api/private/me')).json();
      expect(current.actor.id).not.toBe(me.actor.id);
      release();
      await done;
      await page.waitForTimeout(100);
      await expect(
        page.getByRole('heading', { name: 'Your next step, made clear.', exact: true }),
      ).toBeVisible();
      await expect(page.locator('.record-view')).toHaveCount(0);
      await expect(page.locator('.evidence-download-review')).toHaveCount(0);
      await expect(page.getByText(record.title, { exact: true })).toHaveCount(0);
      expect(downloads).toBe(0);
      const stillCurrent = await page.request.get('/api/private/me');
      expect(stillCurrent.status()).toBe(200);
      expect((await stillCurrent.json()).actor.id).toBe(current.actor.id);
      await page.getByRole('link', { name: 'Account & access', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Account & access.', exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
      expect(page.url()).not.toContain(evidenceId);
    },
  );
