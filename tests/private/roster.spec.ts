import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('an organizer reviews a CSV roster before saving and invalid imports leave it intact', async ({
  page,
}, info) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'participant · synthetic development', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Your next step, made clear.' })).toBeVisible();
  const data = await (await page.request.get('/api/private/records')).json();
  const source = data.records.find(
    (r: { title: string }) => r.title === 'Invented closed association',
  );
  const units = source.data.units as { claimId: string; personId: string }[];
  await page
    .locator('.workflow-card')
    .filter({ has: page.getByRole('heading', { name: 'Cornerstone Association', exact: true }) })
    .getByRole('button', { name: 'Start draft' })
    .click();
  await page.getByLabel('Record title').fill('Invented imported roster ' + info.project.name);
  await page
    .getByLabel('One represented certified event', { exact: true })
    .selectOption(source.data.eventId);
  await page
    .getByLabel('Roll opening date', { exact: true })
    .fill(new Date().toISOString().slice(0, 10));
  await page
    .getByLabel('Member rights and governance', { exact: true })
    .fill('Invented voluntary equal rights, one vote, inspection and first opportunities.');
  const roster = page.locator('.founding-roster');
  await roster.getByText('Import an existing roster', { exact: true }).click();
  const csv = 'claimId,personId\n' + units.map((u) => `${u.claimId},${u.personId}`).join('\n');
  await roster
    .getByLabel('Synthetic roster CSV', { exact: true })
    .setInputFiles({ name: 'invented-roster.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(roster.getByLabel('Eligible claim ID 1', { exact: true })).toHaveValue('');
  await roster.getByRole('button', { name: 'Use imported roster', exact: true }).click();
  await expect(roster.getByLabel('Eligible claim ID 2', { exact: true })).toHaveValue(
    units[1]!.claimId,
  );
  await roster.getByLabel('Synthetic roster CSV', { exact: true }).setInputFiles({
    name: 'invented-invalid.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv + '\n' + `${units[0]!.claimId},${units[0]!.personId}`),
  });
  await expect(roster.getByRole('alert')).toContainText('only once');
  await expect(roster.getByLabel('Eligible claim ID 2', { exact: true })).toHaveValue(
    units[1]!.claimId,
  );
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
    path: `test-results/private-roster-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
  await expect(page.getByText('Simulation receipt · version 1', { exact: true })).toBeVisible();
  await page.reload();
  await page
    .getByLabel('Find a record', { exact: true })
    .fill('Invented imported roster ' + info.project.name);
  await page.locator('.task-card').getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await expect(page.getByLabel('Person ID 2', { exact: true })).toHaveValue(units[1]!.personId);
  // Saving references cannot enroll already-used claims or replace personal consent.
  await page.getByRole('button', { name: 'Cancel editing', exact: true }).click();
  await page.getByLabel('I confirm this submission is complete and accurate').check();
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(
    page
      .locator('.error-panel')
      .filter({ hasText: 'Every proposed founder must own an eligible claim' }),
  ).toBeVisible();
});
