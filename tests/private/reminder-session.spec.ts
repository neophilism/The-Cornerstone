import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function prepare(page: Page) {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'participant · synthetic development', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your next step, made clear.', exact: true }),
  ).toBeVisible();
  await page
    .locator('.workflow-card')
    .filter({ has: page.getByRole('heading', { name: 'Preparation dossier', exact: true }) })
    .getByRole('button', { name: 'Start draft', exact: true })
    .click();
  const title = 'Invented session reminder ' + randomUUID();
  await page.getByLabel('Record title', { exact: true }).fill(title);
  await page.getByLabel('Government action', { exact: true }).fill('Invented reminder action');
  await page.getByLabel('Established livelihood', { exact: true }).fill('Invented livelihood');
  await page.getByLabel('Direct loss', { exact: true }).fill('Invented loss');
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/private/records') && response.request().method() === 'POST',
  );
  // Finish the creation refresh before deliberately expiring a session below;
  // a different in-flight read must not satisfy the calendar's 401 assertion.
  const refreshed = page.waitForResponse((response) =>
    response.url().endsWith('/api/private/notifications'),
  );
  await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
  const { record } = await (await created).json();
  expect(await (await refreshed).finished()).toBeNull();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const me = await (await page.request.get('/api/private/me')).json();
  await page.getByText('Personal calendar reminder', { exact: true }).click();
  await page.getByLabel('Reminder date', { exact: true }).fill('2032-02-29');
  await page.getByRole('checkbox', { name: /I understand that my calendar provider/ }).check();
  return { record, me };
}

async function keepHeldFetchDeliverable(page: Page, path: string) {
  await page.evaluate((heldPath) => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const address =
        typeof input === 'string' ? input : input instanceof Request ? input.url : input.href;
      const url = new URL(address, location.href);
      if (url.pathname + url.search === heldPath) {
        window.fetch = original;
        return original(input, { ...init, signal: null });
      }
      return original(input, init);
    };
  }, path);
}

test('a current non-JSON calendar access 401 clears private workspace state without a file', async ({
  page,
}) => {
  const { record, me } = await prepare(page);
  const path = '/api/private/records?recordId=' + record.id;
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.route('**' + path, async (route) => {
    const logout = await page.request.post('/api/private/auth/logout', {
      headers: { Origin: 'http://127.0.0.1:3001', 'X-CSRF-Token': me.csrf },
      data: {},
    });
    expect(logout.status()).toBe(200);
    const expired = await route.fetch();
    expect(expired.status()).toBe(401);
    await route.fulfill({
      status: 401,
      contentType: 'text/html',
      body: 'Expired current synthetic calendar session',
    });
  });
  await page.getByRole('button', { name: 'Download calendar reminder', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your private workspace.', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(record.title, { exact: true })).toHaveCount(0);
  await expect(page.locator('.record-view')).toHaveCount(0);
  await expect(page.getByLabel('Reminder date', { exact: true })).toHaveCount(0);
  expect(downloads).toBe(0);
  expect((await page.request.get('/api/private/me')).status()).toBe(401);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect(page.url()).not.toContain(record.id);
});

for (const expired of [false, true])
  test(
    'a held calendar ' +
      (expired ? '401' : 'successful response') +
      ' cannot download or clear a replacement sign-in',
    async ({ page }) => {
      const { record, me } = await prepare(page);
      const path = '/api/private/records?recordId=' + record.id;
      let downloads = 0;
      page.on('download', () => downloads++);
      // Bypass transport cancellation so the retained session check must refuse
      // the old successful or non-JSON expiry response after component cleanup.
      await keepHeldFetchDeliverable(page, path);
      let release!: () => void,
        observed!: () => void,
        allowFetch!: () => void,
        fetched!: () => void,
        settled!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const requested = new Promise<void>((resolve) => (observed = resolve));
      const logoutCompleted = new Promise<void>((resolve) => (allowFetch = resolve));
      const responseCaptured = new Promise<void>((resolve) => (fetched = resolve));
      const done = new Promise<void>((resolve) => (settled = resolve));
      await page.route('**' + path, async (route) => {
        observed();
        if (expired) await logoutCompleted;
        const response = await route.fetch();
        expect(response.status()).toBe(expired ? 401 : 200);
        fetched();
        await held;
        try {
          if (expired)
            await route.fulfill({
              status: 401,
              contentType: 'text/html',
              body: 'Expired earlier synthetic calendar session',
            });
          else await route.fulfill({ response });
        } finally {
          settled();
        }
      });
      await page.getByRole('button', { name: 'Download calendar reminder', exact: true }).click();
      await requested;
      if (!expired) await responseCaptured;
      const logout = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/private/auth/logout') &&
          response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      expect((await logout).status()).toBe(200);
      await expect(
        page.getByRole('heading', { name: 'Your private workspace.', exact: true }),
      ).toBeVisible();
      allowFetch();
      await responseCaptured;
      await page
        .getByRole('button', { name: 'successor · synthetic development', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Your next step, made clear.', exact: true }),
      ).toBeVisible();
      const replacement = await (await page.request.get('/api/private/me')).json();
      expect(replacement.actor.id).not.toBe(me.actor.id);
      release();
      await done;
      await page.waitForTimeout(100);
      await expect(
        page.getByRole('heading', { name: 'Your next step, made clear.', exact: true }),
      ).toBeVisible();
      await expect(page.getByText(record.title, { exact: true })).toHaveCount(0);
      await expect(page.locator('.record-view')).toHaveCount(0);
      await expect(page.getByText('Personal calendar reminder', { exact: true })).toHaveCount(0);
      await expect(page.getByLabel('Reminder date', { exact: true })).toHaveCount(0);
      expect(downloads).toBe(0);
      const current = await page.request.get('/api/private/me');
      expect(current.status()).toBe(200);
      expect((await current.json()).actor.id).toBe(replacement.actor.id);
      expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
      expect(page.url()).not.toContain(record.id);
    },
  );

for (const reopen of [false, true])
  test(
    'closing a calendar form' +
      (reopen ? ' and immediately reopening it' : '') +
      ' cancels a valid held read and forgets its date and consent',
    async ({ page }) => {
      const { record, me } = await prepare(page);
      const path = '/api/private/records?recordId=' + record.id;
      let downloads = 0;
      page.on('download', () => downloads++);
      await keepHeldFetchDeliverable(page, path);
      let release!: () => void, observed!: () => void, settled!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const requested = new Promise<void>((resolve) => (observed = resolve));
      const done = new Promise<void>((resolve) => (settled = resolve));
      await page.route('**' + path, async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        observed();
        await held;
        try {
          await route.fulfill({ response });
        } finally {
          settled();
        }
      });
      await page.getByRole('button', { name: 'Download calendar reminder', exact: true }).click();
      await requested;
      const summary = page.getByText('Personal calendar reminder', { exact: true });
      if (reopen)
        await summary.evaluate((element) => {
          // A single browser task coalesces the native toggle notification. The
          // first summary action must invalidate the old request immediately.
          (element as HTMLElement).click();
          (element as HTMLElement).click();
        });
      else await summary.click();
      release();
      await done;
      await page.waitForTimeout(100);
      expect(downloads).toBe(0);
      if (!reopen) await summary.click();
      await expect(page.getByLabel('Reminder date', { exact: true })).toHaveValue('');
      await expect(
        page.getByRole('checkbox', { name: /I understand that my calendar provider/ }),
      ).not.toBeChecked();
      await expect(
        page.getByRole('button', { name: 'Download calendar reminder', exact: true }),
      ).toBeDisabled();
      const current = await page.request.get('/api/private/me');
      expect(current.status()).toBe(200);
      expect((await current.json()).actor.id).toBe(me.actor.id);
      expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    },
  );
