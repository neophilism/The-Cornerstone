import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const flows = [
  {
    name: 'record file',
    open: 'Export record',
    consent: 'I agree to save this unencrypted synthetic record file on this device.',
    confirm: 'Download reviewed record',
    review: 'Review record export',
  },
  {
    name: 'record print',
    open: 'Print record',
    consent: 'I agree to send this reviewed synthetic record to my browser print dialog.',
    confirm: 'Print reviewed record',
    review: 'Review record printing',
  },
  {
    name: 'receipt file',
    open: 'Download receipt',
    consent: 'I agree to save this unencrypted synthetic receipt file on this device.',
    confirm: 'Download reviewed receipt',
    review: 'Review receipt export',
  },
] as const;

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
  const title = 'Invented session export ' + randomUUID();
  await page.getByLabel('Record title', { exact: true }).fill(title);
  await page.getByLabel('Government action', { exact: true }).fill('Invented action for export');
  await page.getByLabel('Established livelihood', { exact: true }).fill('Invented livelihood');
  await page.getByLabel('Direct loss', { exact: true }).fill('Invented loss');
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/private/records') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
  const { record, receipt } = await (await created).json();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  return { record, receipt };
}

for (const flow of flows)
  for (const expired of [false, true])
    test(
      'a held ' +
        flow.name +
        (expired ? ' 401' : ' successful response') +
        ' cannot disclose or clear a later sign-in',
      async ({ page }) => {
        const { record, receipt } = await prepare(page);
        const me = await (await page.request.get('/api/private/me')).json();
        const path =
          flow.name === 'receipt file'
            ? '/api/private/receipts?receiptId=' + receipt.id
            : '/api/private/records?recordId=' + record.id;
        let downloads = 0;
        page.on('download', () => downloads++);
        await page.evaluate(() => {
          const state = window as typeof window & { privateExportPrintCalls: number };
          state.privateExportPrintCalls = 0;
          window.print = () => state.privateExportPrintCalls++;
        });
        await page.getByRole('button', { name: flow.open, exact: true }).click();
        await expect(page.getByRole('heading', { name: flow.review, exact: true })).toBeVisible();
        await page.getByRole('checkbox', { name: flow.consent, exact: true }).check();
        // Keep the final response deliverable after its view disappears. The test
        // exercises retained session checks independently of transport cancellation.
        await page.evaluate((heldPath) => {
          const original = window.fetch.bind(window);
          window.fetch = (input, init) => {
            const address =
              typeof input === 'string' ? input : input instanceof Request ? input.url : input.href;
            const url = new URL(address, location.href);
            if (url.pathname + url.search === heldPath) {
              window.fetch = original;
              return original(input, { ...init, signal: undefined });
            }
            return original(input, init);
          };
        }, path);
        let release!: () => void, observed!: () => void, settled!: () => void;
        const held = new Promise<void>((resolve) => (release = resolve));
        const requested = new Promise<void>((resolve) => (observed = resolve));
        const done = new Promise<void>((resolve) => (settled = resolve));
        await page.route('**' + path, async (route) => {
          if (expired) {
            const logout = await page.request.post('/api/private/auth/logout', {
              headers: { Origin: 'http://127.0.0.1:3001', 'X-CSRF-Token': me.csrf },
              data: {},
            });
            expect(logout.status()).toBe(200);
          }
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
        await page.getByRole('button', { name: flow.confirm, exact: true }).click();
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
        const replacement = await (await page.request.get('/api/private/me')).json();
        expect(replacement.actor.id).not.toBe(me.actor.id);
        release();
        await done;
        await page.waitForTimeout(100);
        await expect(
          page.getByRole('heading', { name: 'Your next step, made clear.', exact: true }),
        ).toBeVisible();
        await expect(page.getByRole('heading', { name: flow.review, exact: true })).toHaveCount(0);
        await expect(page.getByRole('checkbox', { name: flow.consent, exact: true })).toHaveCount(
          0,
        );
        await expect(page.getByText(record.title, { exact: true })).toHaveCount(0);
        await expect(page.locator('.record-view')).toHaveCount(0);
        await expect(page.locator('.reviewed-record-print')).toHaveCount(0);
        expect(await page.evaluate(() => (window as any).privateExportPrintCalls)).toBe(0);
        expect(downloads).toBe(0);
        const current = await page.request.get('/api/private/me');
        expect(current.status()).toBe(200);
        expect((await current.json()).actor.id).toBe(replacement.actor.id);
        expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
        expect(page.url()).not.toContain(record.id);
        expect(page.url()).not.toContain(receipt.id);
      },
    );
