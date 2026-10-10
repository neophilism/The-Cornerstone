import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('public pages are usable, truthful, accessible and do not overflow', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const route of [
    '/',
    '/how-it-works',
    '/participate',
    '/events',
    '/opportunities',
    '/public-record',
    '/policy',
    '/help',
    '/privacy',
    '/accessibility',
    '/workspace',
    '/es',
  ]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator('main')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
    if (route === '/')
      await page.screenshot({ path: `test-results/home-${info.project.name}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
test('the starting guide never claims eligibility and sends no answers', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST') posts.push(r.url());
  });
  await page.goto('/participate');
  await page.getByLabel('My work or business was affected').check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Government deliberately aimed to close or shrink the industry').check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Loss of a primary job or established independent work').check();
  await page.getByRole('button', { name: 'See my starting point' }).click();
  await expect(page.getByText('A guide, not an eligibility result')).toBeVisible();
  expect(posts).toEqual([]);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
test('help search and the workspace tour work', async ({ page }) => {
  await page.goto('/help');
  await page.getByLabel('Search questions').fill('part-time');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(
    page.getByText('What if I kept a part-time job or found another job?'),
  ).toBeVisible();
  await page.goto('/workspace');
  await page.getByRole('link', { name: 'Finance & oversight', exact: true }).click();
  await page.getByRole('button', { name: 'See the proposed steps' }).first().click();
  await expect(page.getByText('Approve fixed commitment')).toBeVisible();
});
