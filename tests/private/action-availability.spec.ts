import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';

test('unavailable exchange actions explain the prerequisite and reject direct submission without changing the draft', async ({
  page,
}, info) => {
  const origin = 'http://127.0.0.1:3002';
  await page.goto(origin);
  await page.getByRole('button', { name: 'commerce · synthetic development', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your next step, made clear.' })).toBeVisible();
  const me = await (await page.request.get(origin + '/api/private/me')).json();
  const headers = { Origin: origin, 'X-CSRF-Token': me.csrf };
  const title = 'Invented unavailable round ' + info.project.name;
  const created = await page.request.post(origin + '/api/private/records', {
    headers,
    data: {
      kind: 'round',
      title,
      idempotencyKey: randomUUID(),
      input: {
        offerIds: [randomUUID()],
        associationIds: [randomUUID()],
        opens: '2030-01-01',
        closes: '2030-02-01',
        algorithm: 'synthetic-v1',
        custodyProtocol: 'Invented preparation only; no installed custody provider',
      },
    },
  });
  expect(created.status()).toBe(201);
  const { record } = await created.json();
  await page.reload();
  await page
    .locator('.task-card')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    .getByRole('button', { name: 'Open', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Publish round rules', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Not available in this release', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish round rules', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Edit draft', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Prepare a draft; submission is unavailable', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Prepare, then submit', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save draft changes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel editing', exact: true }).click();
  const rejected = await page.request.post(origin + '/api/private/commands', {
    headers,
    data: {
      recordId: record.id,
      expectedVersion: 1,
      action: 'publish',
      input: {},
      idempotencyKey: randomUUID(),
    },
  });
  expect(rejected.status()).toBe(503);
  expect(JSON.stringify(await rejected.json())).toContain('CUSTODY_REVIEW_REQUIRED');
  const current = await (
    await page.request.get(origin + '/api/private/records?recordId=' + record.id)
  ).json();
  expect(current.records[0].version).toBe(1);
  expect(current.records[0].state).toBe('draft');
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations.map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: `test-results/private-action-availability-${info.project.name}.png`,
    fullPage: true,
  });
});
