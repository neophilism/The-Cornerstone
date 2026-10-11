import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
test('all approved document downloads preserve the original bytes', async ({ request }) => {
  const manifest = JSON.parse(readFileSync('policy/SOURCE_MANIFEST.json', 'utf8'));
  for (const s of manifest.sources) {
    const slug = s.path
      .split('/')
      .at(-1)
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replaceAll('_', '-');
    const response = await request.get(`/documents/${slug}`);
    expect(response.status()).toBe(200);
    const body = await response.body();
    expect(body.length).toBe(s.bytes);
    expect(createHash('sha256').update(body).digest('hex')).toBe(s.sha256);
    expect(response.headers()['content-disposition']).toContain('attachment;');
    expect(response.headers()['x-robots-tag']).toBe('noindex');
    const cached = await request.get(`/documents/${slug}`, {
      headers: { 'if-none-match': `"${s.sha256}"` },
    });
    expect(cached.status()).toBe(304);
  }
  expect((await request.get('/documents/not-approved')).status()).toBe(404);
});
test('research search, original date labels and evidence provenance remain usable', async ({
  page,
}, info) => {
  await page.goto('/events');
  await page.getByLabel('Search research').fill('national prohibition');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'National Prohibition', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('heading', { name: 'National Prohibition', exact: true })
    .getByRole('link')
    .click();
  await expect(
    page.getByText('No certification or individual finding', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('United States · 1919–1933', { exact: true })).toBeVisible();
  await page.getByText('Citation audit · 1 source record', { exact: true }).click();
  await expect(page.getByText('Workbook · Citation audit · row 5', { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/research-detail-${info.project.name}.png`,
    fullPage: true,
  });
  await page.goto('/events?q=an-unlisted-source-example');
  await expect(page.getByRole('heading', { name: 'No research entry matches.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Prepare an unlisted event' })).toBeVisible();
});
