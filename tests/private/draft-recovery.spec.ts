import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';

async function openDraft(page: Page, suffix: string) {
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
  await page.getByLabel('Record title', { exact: true }).fill('Invented recovery ' + suffix);
  const input = {
    actionDescription: 'Invented original action',
    livelihood: 'Invented original work',
    lossDescription: 'Invented original loss',
  };
  await page.getByLabel('Government action', { exact: true }).fill(input.actionDescription);
  await page.getByLabel('Established livelihood', { exact: true }).fill(input.livelihood);
  await page.getByLabel('Direct loss', { exact: true }).fill(input.lossDescription);
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/private/records') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
  const { record } = await (await response).json();
  await expect(
    page.getByText('Simulation receipt \u00b7 version 1', { exact: true }),
  ).toBeVisible();
  const me = await (await page.request.get('/api/private/me')).json();
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  return { record, input, headers: { Origin: 'http://127.0.0.1:3001', 'X-CSRF-Token': me.csrf } };
}

test('a stale save preserves input and requires explicit overlap choices before rebasing', async ({
  page,
}, info) => {
  const { record, input, headers } = await openDraft(page, 'conflict ' + info.project.name);
  await page.getByLabel('Government action', { exact: true }).fill('Invented local action');
  await page.getByLabel('Direct loss', { exact: true }).fill('Invented local loss');
  const other = await page.request.post('/api/private/commands', {
    headers,
    data: {
      recordId: record.id,
      expectedVersion: 1,
      action: 'save_draft',
      idempotencyKey: randomUUID(),
      input: {
        ...input,
        actionDescription: 'Invented other action',
        livelihood: 'Invented other work',
      },
    },
  });
  expect(other.ok()).toBe(true);
  await page.getByRole('button', { name: 'Save draft changes', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Your unsaved input is still here.' }),
  ).toBeVisible();
  await expect(page.getByLabel('Government action', { exact: true })).toHaveValue(
    'Invented local action',
  );
  await expect(
    page.getByRole('button', { name: 'Save draft changes', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Load current saved version', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Compare with saved version 2', exact: true }),
  ).toBeVisible();
  const proceed = page.getByRole('button', { name: 'Continue with reviewed draft', exact: true });
  await expect(proceed).toBeDisabled();
  await page
    .getByRole('radio', { name: 'Keep my unsaved value for Government action', exact: true })
    .check();
  await expect(proceed).toBeEnabled();
  expect(
    (
      await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    ).violations.map((v) => v.id),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({
    path: `test-results/private-draft-review-${info.project.name}.png`,
    fullPage: true,
  });
  await proceed.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Nothing has been saved yet.' }),
  ).toBeVisible();
  await expect(page.getByLabel('Government action', { exact: true })).toHaveValue(
    'Invented local action',
  );
  await expect(page.getByLabel('Established livelihood', { exact: true })).toHaveValue(
    'Invented other work',
  );
  await expect(page.getByLabel('Direct loss', { exact: true })).toHaveValue('Invented local loss');
  const beforeSave = await (
    await page.request.get('/api/private/records?recordId=' + record.id)
  ).json();
  expect(beforeSave.records[0].version).toBe(2);
  await page.getByRole('button', { name: 'Save draft changes', exact: true }).click();
  await expect(
    page.getByText('Simulation receipt \u00b7 version 3', { exact: true }),
  ).toBeVisible();
  const afterSave = await (
    await page.request.get('/api/private/records?recordId=' + record.id)
  ).json();
  expect(afterSave.records[0].data).toMatchObject({
    actionDescription: 'Invented local action',
    livelihood: 'Invented other work',
    lossDescription: 'Invented local loss',
  });
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test('a committed but lost save survives a denied retry without losing its original intent', async ({
  page,
}, info) => {
  const { record } = await openDraft(page, 'lost response ' + info.project.name);
  await page.getByLabel('Direct loss', { exact: true }).fill('Invented unconfirmed saved loss');
  const requests: unknown[] = [];
  let accepted: any;
  await page.route('**/api/private/commands', async (route) => {
    const body = route.request().postDataJSON();
    if (body.action !== 'save_draft' || body.recordId !== record.id) return route.continue();
    requests.push(body);
    if (requests.length === 1) {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      accepted = await response.json();
      await route.abort('failed');
    } else if (requests.length === 2) {
      await route.fulfill({ status: 403, json: { message: 'Synthetic transient retry denial' } });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Save draft changes', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'The save outcome is unknown.' }),
  ).toBeVisible();
  await expect(page.getByLabel('Direct loss', { exact: true })).toBeDisabled();
  expect(accepted.record.version).toBe(2);
  await page.screenshot({
    path: `test-results/private-draft-uncertain-${info.project.name}.png`,
    fullPage: true,
  });
  const denied = page.waitForResponse(
    (response) => response.url().endsWith('/api/private/commands') && response.status() === 403,
  );
  await page.getByRole('button', { name: 'Retry exact save', exact: true }).click();
  await denied;
  await expect(page.getByRole('button', { name: 'Retry exact save', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Direct loss', { exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Save draft changes', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('alert').filter({ hasText: 'The save outcome is unknown.' }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/private-draft-denied-retry-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Retry exact save', exact: true }).click();
  await expect(
    page.getByText('Simulation receipt \u00b7 version 2', { exact: true }),
  ).toBeVisible();
  expect(requests).toHaveLength(3);
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[2]).toEqual(requests[0]);
  const actual = await (
    await page.request.get('/api/private/records?recordId=' + record.id)
  ).json();
  expect(actual.records[0].version).toBe(2);
  expect(actual.records[0].data.lossDescription).toBe('Invented unconfirmed saved loss');
  await expect(page.getByRole('button', { name: 'Retry exact save', exact: true })).toHaveCount(0);
});

test('review never re-enables a transitioned draft and navigation discards late replies', async ({
  page,
}, info) => {
  const { record, headers } = await openDraft(page, 'transition ' + info.project.name);
  await page
    .getByLabel('Direct loss', { exact: true })
    .fill('Invented input retained during transition');
  expect(
    (
      await page.request.post('/api/private/commands', {
        headers,
        data: {
          recordId: record.id,
          expectedVersion: 1,
          action: 'mark_ready',
          idempotencyKey: randomUUID(),
          input: {},
        },
      })
    ).ok(),
  ).toBe(true);
  await page.getByRole('button', { name: 'Load current saved version', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'no longer editable' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Continue with reviewed draft', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('Direct loss', { exact: true })).toHaveValue(
    'Invented input retained during transition',
  );
  await page.getByRole('button', { name: 'Return to my unsaved draft', exact: true }).click();
  let release!: () => void, observed!: () => void, settled!: () => void;
  const hold = new Promise<void>((resolve) => (release = resolve)),
    requested = new Promise<void>((resolve) => (observed = resolve)),
    done = new Promise<void>((resolve) => (settled = resolve));
  await page.route('**/api/private/records?recordId=' + record.id, async (route) => {
    observed();
    await hold;
    try {
      await route.fulfill({
        status: 200,
        json: {
          records: [{ ...record, version: 3 }],
          capabilities: [{ recordId: record.id, version: 3, actions: ['save_draft'] }],
        },
      });
    } catch {
      /* Navigation can abort the pending network request. */
    } finally {
      settled();
    }
  });
  await page.getByRole('button', { name: 'Load current saved version', exact: true }).click();
  await requested;
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  release();
  await done;
  await expect(page.getByRole('heading', { name: 'Edit your draft', exact: true })).toHaveCount(0);
  await page.waitForTimeout(150);
  await expect(page.getByRole('heading', { name: /Compare with saved version/ })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test('an expired session clears the unsaved editor even with a non-JSON denial', async ({
  page,
}, info) => {
  const { record } = await openDraft(page, 'expiry ' + info.project.name);
  await page.getByLabel('Direct loss', { exact: true }).fill('Invented confidential unsaved input');
  await page.route('**/api/private/records?recordId=' + record.id, (route) =>
    route.fulfill({ status: 401, contentType: 'text/html', body: '<p>Session expired</p>' }),
  );
  await page.getByRole('button', { name: 'Load current saved version', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your private workspace.', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Edit your draft', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
