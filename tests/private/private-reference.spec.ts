import { test, expect, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { Simulation } from '../helpers/simulation.js';

async function login(page: Page, persona: string) {
  await page.goto('/');
  await page
    .getByRole('button', { name: persona + ' · synthetic development', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your next step, made clear.', exact: true }),
  ).toBeVisible();
}
async function clipboard(page: Page) {
  await page.evaluate(() => {
    (window as any).referenceWrites = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as any).referenceWrites.push(value);
        },
      },
    });
  });
}
const writes = (page: Page) => page.evaluate(() => (window as any).referenceWrites);
async function capture(page: Page, filename: string) {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await page.screenshot({ path: 'test-results/' + filename + '.png', fullPage: true });
}

test('founding-unit copy verifies current membership and cancels a held read after navigation', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const world = await new Simulation().connect();
  try {
    const member = await world.persona('member'),
      other = await world.person(),
      labor = await world.persona('labor');
    const title = 'Invented reference membership ' + randomUUID();
    const group = await world.association(member, other, labor, title);
    const unitId = group.firstUnit.id;
    await login(page, 'member');
    await page.getByRole('link', { name: 'Membership & votes', exact: true }).click();
    const card = page
      .locator('.membership-card')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    const copy = card.getByRole('button', { name: 'Copy founding unit ID', exact: true });
    await expect(copy).toBeEnabled();
    await clipboard(page);
    let reads = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/private/memberships')) reads++;
    });
    const url = page.url();
    await copy.click();
    await expect(card.getByRole('status')).toContainText('Verified founding unit ID copied.');
    expect(await writes(page)).toEqual([unitId]);
    expect(reads).toBe(1);
    expect(page.url()).toBe(url);
    await capture(page, 'private-founding-reference-' + info.project.name);

    await page.route('**/api/private/memberships', async (route) => {
      const response = await route.fetch(),
        body = await response.json();
      body.units = body.units.filter((unit: { unitId: string }) => unit.unitId !== unitId);
      await route.fulfill({ response, json: body });
    });
    await copy.click();
    await expect(card.getByRole('status')).toContainText('Nothing was copied.');
    expect(await writes(page)).toEqual([unitId]);
    await expect(card.locator('.private-reference-copy .workspace-id')).toHaveCount(0);
    await page.unroute('**/api/private/memberships');

    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            throw Error('Invented clipboard denial');
          },
        },
      }),
    );
    await copy.click();
    await expect(card.getByRole('status')).toContainText('Clipboard access is unavailable.');
    await expect(card.locator('.private-reference-copy .workspace-id')).toHaveText(unitId);
    await clipboard(page);

    let release!: () => void, arrived!: () => void, settled!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requested = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const done = new Promise<void>((resolve) => {
      settled = resolve;
    });
    await page.route('**/api/private/memberships', async (route) => {
      const response = await route.fetch();
      arrived();
      await held;
      try {
        await route.fulfill({ response });
      } finally {
        settled();
      }
    });
    await copy.click();
    await requested;
    await page.getByRole('link', { name: 'Overview', exact: true }).click();
    release();
    await done;
    await expect(card).toHaveCount(0);
    await page.waitForTimeout(150);
    expect(await writes(page)).toEqual([]);
  } finally {
    await world.close();
  }
});

test('evidence-reference copy rejects changed context, cancels pending disclosure and clears expired sessions', async ({
  page,
}, info) => {
  const world = await new Simulation().connect();
  try {
    const person = await world.persona('participant');
    const title = 'Invented reference evidence ' + randomUUID();
    const record = await world.create(person, 'dossier', title, {
      actionDescription: 'Invented action',
      livelihood: 'Invented livelihood',
      lossDescription: 'Invented direct loss',
    });
    const evidenceId = await world.attach(person, record);
    await login(page, 'participant');
    await page.getByRole('link', { name: 'My records', exact: true }).click();
    await page.getByText('Open a record by reference', { exact: true }).click();
    await page.getByLabel('Record reference', { exact: true }).fill(record.id);
    await page.getByRole('button', { name: 'Open reference', exact: true }).click();
    const card = page.locator('.evidence-card');
    const copy = card.getByRole('button', { name: 'Copy evidence ID', exact: true });
    await expect(copy).toBeEnabled();
    await clipboard(page);
    await copy.click();
    await expect(card.getByRole('status')).toContainText('Verified evidence ID copied.');
    expect(await writes(page)).toEqual([evidenceId]);
    await capture(page, 'private-evidence-reference-' + info.project.name);
    const endpoint = '**/api/private/evidence?recordId=' + record.id;
    await page.route(endpoint, async (route) => {
      const response = await route.fetch(),
        body = await response.json();
      body.context.actorId = randomUUID();
      await route.fulfill({ response, json: body });
    });
    await copy.click();
    await expect(card.getByRole('status')).toContainText('Nothing was copied.');
    expect(await writes(page)).toEqual([evidenceId]);
    await expect(card.locator('.private-reference-copy .workspace-id')).toHaveCount(0);
    await page.unroute(endpoint);

    let release!: () => void, arrived!: () => void, settled!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requested = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const done = new Promise<void>((resolve) => {
      settled = resolve;
    });
    await page.route(endpoint, async (route) => {
      const response = await route.fetch();
      arrived();
      await held;
      try {
        await route.fulfill({ response });
      } finally {
        settled();
      }
    });
    await copy.click();
    await requested;
    await card.getByRole('button', { name: 'Cancel reference copy', exact: true }).click();
    release();
    await done;
    await page.waitForTimeout(150);
    expect(await writes(page)).toEqual([evidenceId]);
    await expect(card.locator('.private-reference-copy .workspace-id')).toHaveCount(0);
    await page.unroute(endpoint);

    const me = await (await page.request.get('/api/private/me')).json();
    const logout = await page.request.post('/api/private/auth/logout', {
      headers: { Origin: 'http://127.0.0.1:3001', 'X-CSRF-Token': me.csrf },
    });
    expect(logout.ok()).toBe(true);
    await copy.click();
    await expect(
      page.getByRole('button', { name: 'participant · synthetic development', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
    expect(await writes(page)).toEqual([evidenceId]);
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  } finally {
    await world.close();
  }
});
