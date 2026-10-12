import { test, expect, type Download } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
async function contents(download: Download) {
  expect(download.suggestedFilename()).toBe('preparation-reminder.ics');
  return readFile((await download.path())!, 'utf8');
}
test('personal reminders require consent, omit case data and do not escape a closed workspace view', async ({
  page,
}, info) => {
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
  const title = 'Invented private reminder ' + info.project.name;
  await page.getByLabel('Record title', { exact: true }).fill(title);
  await page
    .getByLabel('Government action', { exact: true })
    .fill('Invented private government-action details');
  await page
    .getByLabel('Established livelihood', { exact: true })
    .fill('Invented private livelihood details');
  await page
    .getByLabel('Direct loss', { exact: true })
    .fill('Invented private direct-loss details');
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/private/records') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
  const { record } = await (await created).json();
  await page.getByText('Personal calendar reminder', { exact: true }).click();
  const button = page.getByRole('button', { name: 'Download calendar reminder', exact: true });
  await expect(button).toBeDisabled();
  await page.getByLabel('Reminder date', { exact: true }).fill('2032-02-29');
  await expect(button).toBeDisabled();
  await page.getByRole('checkbox', { name: /I understand that my calendar provider/ }).check();
  let downloads = 0;
  page.on('download', () => downloads++);
  const first = page.waitForEvent('download');
  await button.click();
  const text = await contents(await first);
  expect(text).toContain('DTSTART;VALUE=DATE:20320229\r\n');
  expect(text).toContain('DTEND;VALUE=DATE:20320301\r\n');
  expect(text).not.toContain(title);
  expect(text).not.toContain(record.id);
  expect(text).not.toContain('Invented private');
  expect(text).not.toContain('/api/');
  await expect(
    page.getByRole('status').filter({ hasText: 'Calendar file prepared.' }),
  ).toBeVisible();
  const repeated = page.waitForEvent('download');
  await button.click();
  expect(await contents(await repeated)).toBe(text);
  await expect(button).toBeEnabled();
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations.map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({
    path: `test-results/private-reminders-${info.project.name}.png`,
    fullPage: true,
  });
  const endpoint = '**/api/private/records?recordId=' + record.id;
  await page.route(endpoint, (route) =>
    route.fulfill({ status: 403, json: { message: 'Synthetic revoked access' } }),
  );
  await button.click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'No reminder was exported.' }),
  ).toBeVisible();
  expect(downloads).toBe(2);
  await page.unroute(endpoint);
  let release!: () => void;
  let observed!: () => void;
  let settled!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const requested = new Promise<void>((resolve) => (observed = resolve));
  const done = new Promise<void>((resolve) => (settled = resolve));
  await page.route(endpoint, async (route) => {
    observed();
    await held;
    try {
      await route.fulfill({ status: 200, json: { records: [record] } });
    } catch {
      /* A navigation abort is expected. */
    } finally {
      settled();
    }
  });
  await button.click();
  await requested;
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  release();
  await done;
  await expect(page.getByText('Personal calendar reminder', { exact: true })).toHaveCount(0);
  await page.waitForTimeout(150); // Give an incorrectly retained JSON continuation a chance to run.
  expect(downloads).toBe(2);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
