import { test, expect, type Browser, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';

const origin = 'http://127.0.0.1:3001';
async function signIn(page: Page, persona = 'participant') {
  await page
    .getByRole('button', { name: persona + ' · synthetic development', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your next step, made clear.', exact: true }),
  ).toBeVisible();
  return (await page.request.get('/api/private/me')).json();
}
async function anotherSession(browser: Browser, persona = 'participant') {
  const context = await browser.newContext({ baseURL: origin });
  const response = await context.request.post('/api/private/auth/local', {
    headers: { Origin: origin },
    data: { persona },
  });
  expect(response.status()).toBe(200);
  const page = await (await context.request.get('/api/private/auth/sessions')).json();
  return { context, id: page.context.currentSessionId as string };
}
async function account(page: Page) {
  await page.getByRole('link', { name: 'Account & access', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Current session', exact: true })).toBeVisible();
}
async function capture(page: Page, name: string) {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map((violation) => violation.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/' + name + '.png', fullPage: true });
}

test('a lost single revocation recovers its original event through a denied retry and a failed inventory refresh', async ({
  page,
  browser,
}, info) => {
  await page.goto('/');
  await signIn(page);
  const other = await anotherSession(browser);
  try {
    await account(page);
    let mode = 'lost';
    const requests: string[] = [];
    let original: unknown;
    await page.route('**/api/private/auth/sessions/revoke-selected', async (route) => {
      requests.push(route.request().postData()!);
      expect(route.request().postDataJSON().sessionIds).toEqual([other.id]);
      if (mode === 'denied') {
        await route.fulfill({
          status: 403,
          json: { code: 'DENIED', message: 'Invented denied retry' },
        });
        return;
      }
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      const data = await response.json();
      if (mode === 'lost') {
        original = data;
        await route.fulfill({
          status: 503,
          json: { code: 'REQUEST_OUTCOME_UNKNOWN', message: 'Invented lost reply' },
        });
      } else {
        expect(data).toEqual(original);
        await route.fulfill({ response });
      }
    });
    await page
      .locator('[data-session-id="' + other.id + '"]')
      .getByRole('button', {
        name: 'Sign out this session',
        exact: true,
      })
      .click();
    await expect(page.getByRole('alert')).toContainText('outcome is unknown');
    expect((await other.context.request.get('/api/private/me')).status()).toBe(401);
    const retry = page.getByRole('button', { name: 'Retry exact session revocation', exact: true });
    mode = 'denied';
    await retry.click();
    await expect(page.getByRole('alert')).toContainText('outcome is unknown');
    await expect(retry).toBeEnabled();
    await capture(page, 'private-session-recovery-' + info.project.name);
    await page.route('**/api/private/auth/sessions', (route) =>
      route.fulfill({
        status: 503,
        json: { code: 'UNAVAILABLE', message: 'Invented inventory unavailable' },
      }),
    );
    mode = 'recover';
    await retry.click();
    await expect(page.locator('.session-revocation-confirmed')).toContainText(
      'Revocation confirmed for 1',
    );
    await expect(page.getByRole('alert')).toContainText('Session details are unavailable');
    await expect(page.getByRole('heading', { name: 'Current session', exact: true })).toHaveCount(
      0,
    );
    await expect(retry).toHaveCount(0);
    expect(requests).toHaveLength(3);
    expect(new Set(requests).size).toBe(1);
    expect((await page.request.get('/api/private/me')).status()).toBe(200);
    await capture(page, 'private-session-confirmed-unavailable-' + info.project.name);
    await page.unroute('**/api/private/auth/sessions');
    await page.getByRole('button', { name: 'Refresh sessions', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Current session', exact: true })).toBeVisible();
    await expect(page.locator('.session-revocation-confirmed')).toBeVisible();
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  } finally {
    await other.context.close();
  }
});

test('bulk recovery rejects a substituted reply and never revokes a session created after selection', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await signIn(page);
  const first = await anotherSession(browser),
    second = await anotherSession(browser);
  let later: Awaited<ReturnType<typeof anotherSession>> | undefined;
  try {
    await account(page);
    const requests: string[] = [];
    let original: any;
    await page.route('**/api/private/auth/sessions/revoke-selected', async (route) => {
      requests.push(route.request().postData()!);
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      const data = await response.json();
      if (requests.length === 1) {
        original = structuredClone(data);
        data.context.actorId = randomUUID();
        await route.fulfill({ response, json: data });
      } else {
        expect(data).toEqual(original);
        await route.fulfill({ response });
      }
    });
    await page.getByRole('button', { name: 'Sign out listed other sessions', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('outcome is unknown');
    expect(original.sessionIds).toContain(first.id);
    expect(original.sessionIds).toContain(second.id);
    later = await anotherSession(browser);
    await page.getByRole('button', { name: 'Retry exact session revocation', exact: true }).click();
    await expect(page.locator('.session-revocation-confirmed')).toContainText(
      'Revocation confirmed',
    );
    await expect(page.locator('[data-session-id="' + later.id + '"]')).toContainText(
      'Other session',
    );
    expect(new Set(requests).size).toBe(1);
    expect(original.sessionIds).not.toContain(later.id);
    expect((await first.context.request.get('/api/private/me')).status()).toBe(401);
    expect((await second.context.request.get('/api/private/me')).status()).toBe(401);
    expect((await later.context.request.get('/api/private/me')).status()).toBe(200);
    expect((await page.request.get('/api/private/me')).status()).toBe(200);
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  } finally {
    await first.context.close();
    await second.context.close();
    await later?.context.close();
  }
});

test('a changed HTTP sign-in replaces the account context instead of adopting a mismatched inventory', async ({
  page,
}) => {
  await page.goto('/');
  const before = await signIn(page);
  await account(page);
  const changed = await page.request.post('/api/private/auth/local', {
    headers: { Origin: origin },
    data: { persona: 'successor' },
  });
  expect(changed.status()).toBe(200);
  const current = await (await page.request.get('/api/private/me')).json();
  expect(current.actor.id).not.toBe(before.actor.id);
  await page.getByRole('button', { name: 'Refresh sessions', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your next step, made clear.', exact: true }),
  ).toBeVisible();
  await account(page);
  await expect(page.getByText(current.actor.id, { exact: true })).toBeVisible();
  await expect(page.getByText(before.actor.id, { exact: true })).toHaveCount(0);
});

test('a held inventory cannot replace the sessions displayed after another sign-in', async ({
  page,
}) => {
  await page.goto('/');
  await signIn(page);
  await account(page);
  const original = await (await page.request.get('/api/private/auth/sessions')).json();
  let release!: () => void, arrived!: () => void, settled!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const requested = new Promise<void>((resolve) => (arrived = resolve));
  const done = new Promise<void>((resolve) => (settled = resolve));
  await page.route(
    '**/api/private/auth/sessions',
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      arrived();
      await held;
      try {
        await route.fulfill({ response });
      } finally {
        settled();
      }
    },
    { times: 1 },
  );
  await page.getByRole('button', { name: 'Refresh sessions', exact: true }).click();
  await requested;
  await expect(page.locator('[data-session-id]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your private workspace.', exact: true }),
  ).toBeVisible();
  await signIn(page, 'successor');
  await account(page);
  const current = await (await page.request.get('/api/private/auth/sessions')).json();
  release();
  await done;
  await page.waitForTimeout(100);
  await expect(
    page.locator('[data-session-id="' + current.context.currentSessionId + '"]'),
  ).toContainText('Current session');
  await expect(
    page.locator('[data-session-id="' + original.context.currentSessionId + '"]'),
  ).toHaveCount(0);
  await expect(page.getByText(current.context.actorId, { exact: true })).toBeVisible();
});

for (const expired of [false, true])
  test(
    'a held revocation ' + (expired ? '401' : 'confirmation') + ' cannot alter a later sign-in',
    async ({ page, browser }) => {
      await page.goto('/');
      const before = await signIn(page);
      const other = await anotherSession(browser);
      try {
        await account(page);
        let release!: () => void, arrived!: () => void, settled!: () => void;
        const held = new Promise<void>((resolve) => (release = resolve));
        const requested = new Promise<void>((resolve) => (arrived = resolve));
        const done = new Promise<void>((resolve) => (settled = resolve));
        await page.route('**/api/private/auth/sessions/revoke-selected', async (route) => {
          if (expired) {
            const logout = await page.request.post('/api/private/auth/logout', {
              headers: { Origin: origin, 'X-CSRF-Token': before.csrf },
              data: {},
            });
            expect(logout.status()).toBe(200);
          }
          const response = await route.fetch();
          expect(response.status()).toBe(expired ? 401 : 200);
          arrived();
          await held;
          try {
            await route.fulfill({ response });
          } finally {
            settled();
          }
        });
        await page
          .locator('[data-session-id="' + other.id + '"]')
          .getByRole('button', {
            name: 'Sign out this session',
            exact: true,
          })
          .click();
        await requested;
        await page.getByRole('button', { name: 'Sign out', exact: true }).click();
        await expect(
          page.getByRole('heading', { name: 'Your private workspace.', exact: true }),
        ).toBeVisible();
        const current = await signIn(page, 'successor');
        await account(page);
        release();
        await done;
        await page.waitForTimeout(100);
        await expect(
          page.getByRole('heading', { name: 'Account & access.', exact: true }),
        ).toBeVisible();
        await expect(page.getByText(current.actor.id, { exact: true })).toBeVisible();
        await expect(page.getByText(before.actor.id, { exact: true })).toHaveCount(0);
        await expect(page.locator('.session-revocation-confirmed')).toHaveCount(0);
        await expect(page.locator('.session-revocation-recovery')).toHaveCount(0);
        expect((await page.request.get('/api/private/me')).status()).toBe(200);
        if (expired) {
          const logout = await page.request.post('/api/private/auth/logout', {
            headers: { Origin: origin, 'X-CSRF-Token': current.csrf },
            data: {},
          });
          expect(logout.status()).toBe(200);
          await page.getByRole('button', { name: 'Refresh sessions', exact: true }).click();
          await expect(
            page.getByRole('heading', { name: 'Your private workspace.', exact: true }),
          ).toBeVisible();
          await expect(page.getByText(current.actor.id, { exact: true })).toHaveCount(0);
        }
        expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
      } finally {
        await other.context.close();
      }
    },
  );
