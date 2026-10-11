import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
async function signIn(page: Page, persona: string, staff = false) {
  await page.goto(staff ? 'http://127.0.0.1:3002' : '/');
  await page
    .getByRole('button', { name: `${persona} · synthetic development`, exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Your next step, made clear.' })).toBeVisible();
}
async function start(page: Page, name: string) {
  await page
    .locator('.workflow-card')
    .filter({ has: page.getByRole('heading', { name, exact: true }) })
    .getByRole('button', { name: 'Start draft' })
    .click();
}
async function open(page: Page, title: string) {
  await page
    .locator('.task-card')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    .getByRole('button', { name: 'Open', exact: true })
    .click();
}
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
}
test('a private draft survives editing and reloading, with versioned receipts', async ({
  page,
}, info) => {
  await signIn(page, 'participant');
  await start(page, 'Preparation dossier');
  const title = `Invented livelihood ${info.project.name}`;
  await page.getByLabel('Record title').fill(title);
  await page
    .getByLabel('Government action', { exact: true })
    .fill('Invented deliberate industry contraction');
  await page
    .getByLabel('Established livelihood', { exact: true })
    .fill('Invented primary job with retained part-time work');
  await page
    .getByLabel('Direct loss', { exact: true })
    .fill('Invented direct loss requiring reliable proof');
  await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
  await expect(page.getByText('Simulation receipt · version 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await page.getByLabel('Direct loss', { exact: true }).fill('Corrected invented direct loss');
  await page.getByRole('button', { name: 'Save draft changes', exact: true }).click();
  await expect(page.getByText('Simulation receipt · version 2', { exact: true })).toBeVisible();
  await expect(page.getByText('Corrected invented direct loss', { exact: true })).toBeVisible();
  await page.reload();
  await open(page, title);
  await expect(page.getByText('Corrected invented direct loss', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mark preparation complete', exact: true }).click();
  await expect(page.getByText('Simulation receipt · version 3', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit draft', exact: true })).toHaveCount(0);
  await accessible(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/private-dossier-${info.project.name}.png`,
    fullPage: true,
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download receipt', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('cornerstone-simulation-receipt.json');
  await page.getByRole('link', { name: /^Activity/ }).click();
  await expect(page.getByRole('heading', { name: 'Activity updates.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start a new record', exact: true })).toHaveCount(
    0,
  );
  await expect(async () => {
    await page.getByRole('button', { name: 'Refresh updates', exact: true }).click();
    await expect(
      page.locator('.activity-card').filter({ hasText: title }).filter({ hasText: 'version 3' }),
    ).not.toHaveCount(0);
  }).toPass({ timeout: 10000 });
  const update = page
    .locator('.activity-card')
    .filter({ hasText: title })
    .filter({ hasText: 'version 3' })
    .first();
  await update.getByRole('button', { name: 'Mark read', exact: true }).click();
  await expect(update.getByText('Read · simulation', { exact: true })).toBeVisible();
  await accessible(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/private-activity-${info.project.name}.png`,
    fullPage: true,
  });
  await page.reload();
  await page.getByRole('link', { name: /^Activity/ }).click();
  await expect(
    page
      .locator('.activity-card')
      .filter({ hasText: title })
      .first()
      .getByText('Read · simulation', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your private workspace.' })).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
});
test('assigned support can answer a request and the participant can see the persisted response', async ({
  page,
}, info) => {
  await signIn(page, 'participant');
  await start(page, 'Help request');
  const title = `Invented support request ${info.project.name}`;
  await page.getByLabel('Record title').fill(title);
  await page.getByLabel('Help topic', { exact: true }).fill('Using the preparation guide');
  await page
    .getByLabel('Question', { exact: true })
    .fill('Can an unlisted historical event be researched?');
  await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
  await page.getByLabel('I confirm this submission is complete and accurate').check();
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(page.getByText('Simulation receipt · version 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await signIn(page, 'support', true);
  await open(page, title);
  await page
    .getByLabel('Response', { exact: true })
    .fill(
      'An unlisted historical event may be researched; reliable proof and separate findings are required.',
    );
  await page.getByRole('button', { name: 'Provide a response', exact: true }).click();
  await expect(page.getByText('Simulation receipt · version 3', { exact: true })).toBeVisible();
  await accessible(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/private-support-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await signIn(page, 'participant');
  await open(page, title);
  await expect(
    page.getByText(
      'An unlisted historical event may be researched; reliable proof and separate findings are required.',
      { exact: true },
    ),
  ).toBeVisible();
});
test('private HTTP mutations enforce origin, CSRF and server roles', async ({ page }) => {
  await signIn(page, 'participant');
  const me = await (await page.request.get('/api/private/me')).json();
  const command = {
    kind: 'dossier',
    title: 'Invented rejected request',
    input: {
      actionDescription: 'Invented action',
      livelihood: 'Invented work',
      lossDescription: 'Invented loss',
    },
    idempotencyKey: randomUUID(),
  };
  expect(
    (
      await page.request.post('/api/private/records', {
        headers: { Origin: 'https://unapproved.example', 'X-CSRF-Token': me.csrf },
        data: command,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post('/api/private/records', {
        headers: { Origin: 'http://127.0.0.1:3001' },
        data: command,
      })
    ).status(),
  ).toBe(403);
  const headers = { Origin: 'http://127.0.0.1:3001', 'X-CSRF-Token': me.csrf };
  const first = await page.request.post('/api/private/records', { headers, data: command });
  expect(first.status()).toBe(201);
  const saved = await first.json();
  const replay = await (
    await page.request.post('/api/private/records', { headers, data: command })
  ).json();
  expect(replay.receipt.id).toBe(saved.receipt.id);
  expect(
    (
      await page.request.post('/api/private/records', {
        headers,
        data: { ...command, title: 'Changed same-key content' },
      })
    ).status(),
  ).toBe(409);
  const denied = await page.request.post('/api/private/records', {
    headers,
    data: { ...command, kind: 'offer', idempotencyKey: randomUUID() },
  });
  expect(denied.status()).toBe(422);
  expect((await denied.json()).code).toBe('ROLE_REQUIRED');
});
test('account controls revoke other sessions without ending the current one', async ({
  page,
}, info) => {
  await signIn(page, 'participant');
  const context = await page.context().browser()!.newContext({ baseURL: 'http://127.0.0.1:3001' });
  try {
    const other = await context.newPage();
    await signIn(other, 'participant');
    await page.getByRole('link', { name: 'Account & access', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Account & access.' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Sign out other sessions', exact: true }),
    ).toBeEnabled();
    await accessible(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/private-account-${info.project.name}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Sign out other sessions', exact: true }).click();
    await expect(
      page.getByText('Other active sessions have been signed out.', { exact: true }),
    ).toBeVisible();
    expect((await other.request.get('/api/private/me')).status()).toBe(401);
    expect((await page.request.get('/api/private/me')).status()).toBe(200);
    await other.reload();
    await expect(other.getByRole('heading', { name: 'Your private workspace.' })).toBeVisible();
  } finally {
    await context.close();
  }
});
test('an owner can grant read access and revoke it, with no edit controls for the reader', async ({
  page,
}, info) => {
  await signIn(page, 'participant');
  const context = await page.context().browser()!.newContext({ baseURL: 'http://127.0.0.1:3001' });
  try {
    const recipient = await context.newPage();
    await signIn(recipient, 'member');
    const me = await (await recipient.request.get('/api/private/me')).json();
    await start(page, 'Preparation dossier');
    const title = `Invented shared record ${info.project.name}`;
    await page.getByLabel('Record title').fill(title);
    await page.getByLabel('Government action', { exact: true }).fill('Invented policy choice');
    await page
      .getByLabel('Established livelihood', { exact: true })
      .fill('Invented primary livelihood');
    await page.getByLabel('Direct loss', { exact: true }).fill('Invented loss and evidence');
    await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
    await page.getByText('Help with this record', { exact: true }).click();
    await page.getByLabel('Recipient workspace ID', { exact: true }).fill(me.actor.id);
    await page
      .getByLabel('Access expiration date', { exact: true })
      .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    await page
      .getByLabel('I authorize this person to read this record, its versions and receipts.', {
        exact: true,
      })
      .check();
    await page.getByRole('button', { name: 'Give draft access', exact: true }).click();
    await expect(page.getByText('Simulation receipt · version 2', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revoke access', exact: true })).toBeVisible();
    await accessible(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/private-access-${info.project.name}.png`,
      fullPage: true,
    });
    await recipient.reload();
    await open(recipient, title);
    await expect(recipient.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(recipient.getByRole('button', { name: 'Edit draft', exact: true })).toHaveCount(0);
    await expect(recipient.getByText('Help with this record', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Revoke access', exact: true }).click();
    await expect(page.getByText('Simulation receipt · version 3', { exact: true })).toBeVisible();
    await recipient.reload();
    await expect(recipient.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
