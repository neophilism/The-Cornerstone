import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('older activity stays available and reading an older entry preserves the page', async ({
  page,
}, info) => {
  await page.goto('/');
  const firstPage = page.waitForResponse(
    (r) => r.url().endsWith('/api/private/notifications') && r.request().method() === 'GET',
  );
  await page
    .getByRole('button', { name: 'participant · synthetic development', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Your next step, made clear.' })).toBeVisible();
  await page.getByRole('link', { name: /^Activity/ }).click();
  await expect(page.locator('.activity-card')).toHaveCount(50);
  const snapshot = await (await firstPage).json();
  expect(snapshot.unreadCount).toBeGreaterThan(100);
  await expect(
    page.getByRole('link', { name: `Activity (${snapshot.unreadCount} unread)`, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Load older updates', exact: true }).click();
  await expect(page.locator('.activity-card')).toHaveCount(100);
  // Index the last unread row; the desktop run may have already read another row.
  const index = await page
    .locator('.activity-card')
    .evaluateAll((cards) =>
      cards.findLastIndex((card) =>
        [...card.querySelectorAll('button')].some((button) => button.textContent === 'Mark read'),
      ),
    );
  expect(index).toBeGreaterThanOrEqual(50);
  const last = page.locator('.activity-card').nth(index);
  await last.getByRole('button', { name: 'Mark read', exact: true }).click();
  await expect(last.getByText('Read · simulation', { exact: true })).toBeVisible();
  await expect(page.locator('.activity-card')).toHaveCount(100);
  const opened = page.waitForResponse((r) => r.url().includes('/api/private/records?recordId='));
  await last.getByRole('button', { name: 'Open record', exact: true }).click();
  const record = (await (await opened).json()).records[0];
  await expect(page.getByRole('heading', { name: record.title, exact: true })).toBeVisible();
  await page.getByRole('link', { name: /^Activity/ }).click();
  await page.getByRole('button', { name: 'Refresh updates', exact: true }).click();
  await expect(page.locator('.activity-card')).toHaveCount(50);
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations.map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await page.screenshot({
    path: `test-results/private-activity-pages-${info.project.name}.png`,
    fullPage: false,
  });
});
