import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function signIn(page: Page, persona = 'participant') {
  await page
    .getByRole('button', { name: persona + ' · synthetic development', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your next step, made clear.', exact: true }),
  ).toBeVisible();
  return (await page.request.get('/api/private/me')).json();
}
async function create(page: Page, me: { csrf: string }, suffix: string) {
  const response = await page.request.post('/api/private/records', {
    headers: { Origin: 'http://127.0.0.1:3001', 'X-CSRF-Token': me.csrf },
    data: {
      kind: 'dossier',
      title: 'Invented reference ' + suffix + ' ' + randomUUID(),
      idempotencyKey: randomUUID(),
      input: {
        actionDescription: 'Invented action',
        livelihood: 'Invented work',
        lossDescription: 'Invented loss',
      },
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).record;
}
async function prepare(page: Page) {
  await page.goto('/');
  const me = await signIn(page);
  const first = await create(page, me, 'first');
  const second = await create(page, me, 'second');
  return { me, first, second };
}
async function referenceForm(page: Page) {
  await page.getByRole('link', { name: 'My records', exact: true }).click();
  if (!(await page.getByLabel('Record reference', { exact: true }).isVisible()))
    await page.getByText('Open a record by reference', { exact: true }).click();
}
async function openReference(page: Page, id: string) {
  await referenceForm(page);
  await page.getByLabel('Record reference', { exact: true }).fill(id);
  await page.getByRole('button', { name: 'Open reference', exact: true }).click();
}
async function holdRead(page: Page, id: string, expired = false) {
  let release!: () => void, observed!: () => void, settled!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const requested = new Promise<void>((resolve) => (observed = resolve));
  const done = new Promise<void>((resolve) => (settled = resolve));
  const endpoint = '**/api/private/records?recordId=' + id;
  await page.route(
    endpoint,
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
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
    },
    { times: 1 },
  );
  return { requested, done, release };
}
async function capture(page: Page, name: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations.map((violation) => violation.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/' + name + '.png', fullPage: true });
}
async function settle(page: Page, held: { release: () => void; done: Promise<void> }) {
  held.release();
  await held.done;
  // Let the delivered response's fetch continuation and React render finish.
  await page.waitForTimeout(100);
}

test('direct references reject substituted content, workspace context and permission versions', async ({
  page,
}, info) => {
  const { me, first, second } = await prepare(page);
  let substitution = 'record';
  const endpoint = '**/api/private/records?recordId=' + first.id;
  await page.route(endpoint, async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    expect(data.context).toEqual({ actorId: me.actor.id, realm: me.actor.realm });
    if (substitution === 'record') {
      data.records = [second];
      data.capabilities = [
        { recordId: second.id, version: second.version, actions: ['save_draft'] },
      ];
    } else if (substitution === 'actor') data.context.actorId = randomUUID();
    else if (substitution === 'realm') data.records[0].realm = 'program';
    else data.capabilities[0].version++;
    await route.fulfill({ response, json: data });
  });
  for (substitution of ['record', 'actor', 'realm', 'capabilities']) {
    await openReference(page, first.id);
    await expect(page.locator('.error-panel')).toBeVisible();
    await expect(page.locator('.record-view')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit draft', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open reference', exact: true })).toBeEnabled();
  }
  await capture(page, 'private-reference-rejected-' + info.project.name);
  await page.unroute(endpoint);
  await openReference(page, first.id);
  await expect(
    page.locator('.record-view').getByRole('heading', { name: first.title, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit draft', exact: true })).toBeEnabled();
  expect(page.url()).not.toContain(first.id);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

test('changing a reference or leaving the view cancels a held record opening', async ({
  page,
}, info) => {
  const { first, second } = await prepare(page);
  const held = await holdRead(page, first.id);
  await openReference(page, first.id);
  await held.requested;
  await expect(
    page.getByRole('status').filter({ hasText: 'Checking current record access' }),
  ).toBeVisible();
  await capture(page, 'private-reference-loading-' + info.project.name);
  await page.getByLabel('Record reference', { exact: true }).fill(second.id);
  await expect(page.getByRole('button', { name: 'Open reference', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Open reference', exact: true }).click();
  await expect(
    page.locator('.record-view').getByRole('heading', { name: second.title, exact: true }),
  ).toBeVisible();
  await settle(page, held);
  await expect(
    page.locator('.record-view').getByRole('heading', { name: second.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.record-view').getByRole('heading', { name: first.title, exact: true }),
  ).toHaveCount(0);
  const leaving = await holdRead(page, first.id);
  await openReference(page, first.id);
  await leaving.requested;
  await page.getByRole('link', { name: 'Account & access', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Account & access.', exact: true })).toBeVisible();
  await settle(page, leaving);
  await expect(page.getByRole('heading', { name: 'Account & access.', exact: true })).toBeVisible();
  await expect(page.locator('.record-view')).toHaveCount(0);
  await expect(page.locator('.record-opening')).toHaveCount(0);
});

test('an externally changed session clears earlier data before a delayed new record page fails', async ({
  page,
}, info) => {
  const { me, first } = await prepare(page);
  await openReference(page, first.id);
  await expect(
    page.locator('.record-view').getByRole('heading', { name: first.title, exact: true }),
  ).toBeVisible();
  await referenceForm(page);
  await expect(page.getByText(first.title, { exact: true })).toBeVisible();
  await page.getByLabel('Find a record', { exact: true }).fill(first.title);
  // This is the existing localhost synthetic login endpoint, called outside the component
  // to model a cookie/session change observed on the next authenticated refresh.
  const changed = await page.request.post('/api/private/auth/local', {
    headers: { Origin: 'http://127.0.0.1:3001' },
    data: { persona: 'successor' },
  });
  expect(changed.status()).toBe(200);
  const current = await (await page.request.get('/api/private/me')).json();
  expect(current.actor.id).not.toBe(me.actor.id);
  const currentRecord = await create(page, current, 'changed-session');
  let release!: () => void, observed!: () => void, settled!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const requested = new Promise<void>((resolve) => (observed = resolve));
  const done = new Promise<void>((resolve) => (settled = resolve));
  await page.route(
    '**/api/private/records?limit=50',
    async (route) => {
      const response = await route.fetch();
      expect((await response.json()).context.actorId).toBe(current.actor.id);
      observed();
      await held;
      try {
        await route.fulfill({
          status: 503,
          json: { code: 'UNAVAILABLE', message: 'Invented current page unavailable' },
        });
      } finally {
        settled();
      }
    },
    { times: 1 },
  );
  await page.getByRole('button', { name: 'Refresh recent records', exact: true }).click();
  await requested;
  await expect(page.getByText('Loading your workspace…', { exact: true })).toBeVisible();
  await expect(page.getByText(first.title, { exact: true })).toHaveCount(0);
  await expect(page.locator('.record-view')).toHaveCount(0);
  await settle(page, { release, done });
  await expect(page.locator('.error-panel')).toContainText('Invented current page unavailable');
  await expect(page.getByText(first.title, { exact: true })).toHaveCount(0);
  await referenceForm(page);
  await expect(page.getByLabel('Record reference', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Refresh recent records', exact: true }).click();
  await expect(page.getByLabel('Find a record', { exact: true })).toHaveValue('');
  await expect(page.getByText(currentRecord.title, { exact: true })).toBeVisible();
  await expect(page.getByText(first.title, { exact: true })).toHaveCount(0);
  await capture(page, 'private-reference-changed-session-' + info.project.name);
});

for (const expired of [false, true])
  test(
    'an earlier session’s held ' +
      (expired ? '401' : 'successful read') +
      ' cannot alter a new sign-in',
    async ({ page }, info) => {
      const { me, first } = await prepare(page);
      await referenceForm(page);
      await page.getByRole('button', { name: 'Refresh recent records', exact: true }).click();
      await expect(page.getByLabel('Find a record', { exact: true })).toBeVisible();
      await page.getByLabel('Find a record', { exact: true }).fill(first.title);
      const held = await holdRead(page, first.id, expired);
      await openReference(page, first.id);
      await held.requested;
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Your private workspace.', exact: true }),
      ).toBeVisible();
      const current = await signIn(page, 'successor');
      expect(current.actor.id).not.toBe(me.actor.id);
      const currentRecord = await create(page, current, 'current-session');
      await settle(page, held);
      await expect(
        page.getByRole('heading', { name: 'Your next step, made clear.', exact: true }),
      ).toBeVisible();
      await expect(page.locator('.record-view')).toHaveCount(0);
      expect((await page.request.get('/api/private/me')).status()).toBe(200);
      await referenceForm(page);
      await page.getByRole('button', { name: 'Refresh recent records', exact: true }).click();
      await expect(page.getByLabel('Record reference', { exact: true })).toHaveValue('');
      await expect(page.getByLabel('Find a record', { exact: true })).toHaveValue('');
      await page.getByLabel('Record reference', { exact: true }).fill(first.id);
      await page.getByRole('button', { name: 'Open reference', exact: true }).click();
      await expect(page.locator('.error-panel')).toContainText(
        'Record not found or no longer accessible.',
      );
      await expect(page.locator('.record-view')).toHaveCount(0);
      if (expired) {
        await openReference(page, currentRecord.id);
        await expect(
          page
            .locator('.record-view')
            .getByRole('heading', { name: currentRecord.title, exact: true }),
        ).toBeVisible();
        const logout = await page.request.post('/api/private/auth/logout', {
          headers: { Origin: 'http://127.0.0.1:3001', 'X-CSRF-Token': current.csrf },
          data: {},
        });
        expect(logout.status()).toBe(200);
        await openReference(page, currentRecord.id);
        await expect(
          page.getByRole('heading', { name: 'Your private workspace.', exact: true }),
        ).toBeVisible();
        await expect(page.locator('.record-view')).toHaveCount(0);
        await expect(page.getByText(currentRecord.title, { exact: true })).toHaveCount(0);
        await capture(page, 'private-current-session-expired-' + info.project.name);
      }
      expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
      expect(page.url()).not.toContain(first.id);
    },
  );
