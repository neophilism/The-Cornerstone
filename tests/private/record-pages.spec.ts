import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('older records remain discoverable and a supplied reference grants no access', async ({
  page,
}, info) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'participant · synthetic development', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Your next step, made clear.' })).toBeVisible();
  // Obtain the oldest accessible reference through the same paged endpoint, not an owner connection.
  let pageData = await (await page.request.get('/api/private/records?limit=200')).json();
  expect(pageData.nextCursor).toBeTruthy();
  while (pageData.nextCursor)
    pageData = await (
      await page.request.get(
        '/api/private/records?limit=200&cursor=' + encodeURIComponent(pageData.nextCursor),
      )
    ).json();
  const target = pageData.records.at(-1);
  expect(target.title).toMatch(/^Invented older preparation/);
  await page.getByLabel('Find a record', { exact: true }).fill(target.title);
  await expect(
    page.getByText('No loaded records match this search. Older records are still available.'),
  ).toBeVisible();
  for (let i = 0; i < 6 && (await page.locator('.task-card').count()) === 0; i++) {
    await page.getByRole('button', { name: 'Load older records', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Loading…', exact: true })).toHaveCount(0);
  }
  await expect(page.locator('.task-card')).toHaveCount(1);
  await page.locator('.task-card').getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('heading', { name: target.title, exact: true })).toBeVisible();
  await page.reload();
  await page.getByText('Open a record by reference', { exact: true }).click();
  await page.getByLabel('Record reference', { exact: true }).fill(target.id);
  await page.getByRole('button', { name: 'Open reference', exact: true }).click();
  await expect(page.getByRole('heading', { name: target.title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to records', exact: true }).click();
  await page.getByText('Open a record by reference', { exact: true }).click();
  await page
    .getByLabel('Record reference', { exact: true })
    .fill('00000000-0000-4000-8000-000000000001');
  await page.getByRole('button', { name: 'Open reference', exact: true }).click();
  await expect(page.locator('.error-panel')).toContainText(
    'Record not found or no longer accessible.',
  );
  await page.getByLabel('Find a record', { exact: true }).fill(target.title);
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations.map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });
  await page.screenshot({
    path: `test-results/private-record-pages-${info.project.name}.png`,
    fullPage: true,
  });
});
