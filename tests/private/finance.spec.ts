import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function signIn(page: Page, persona: string, staff = false) {
  await page.goto(staff ? 'http://127.0.0.1:3002' : '/');
  await expect(
    page.getByRole('heading', { name: /Your private workspace\.|Your next step, made clear\./ }),
  ).toBeVisible();
  if (await page.getByRole('button', { name: 'Sign out', exact: true }).count()) {
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your private workspace.' })).toBeVisible();
  }
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
async function capture(page: Page, path: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations.map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });
  await page.screenshot({ path, fullPage: true });
}
test('state financial terms require a supplied prospective rate and persist the protected baseline', async ({
  page,
}, info) => {
  await signIn(page, 'state', true);
  await start(page, 'State offer');
  await page.getByLabel('Record title').fill('Invented financial offer ' + info.project.name);
  await page.getByRole('button', { name: 'Use a supplied record ID', exact: true }).click();
  await page
    .getByLabel('Verified state authority packet', { exact: true })
    .fill('00000000-0000-4000-8000-000000000002');
  await page
    .getByLabel('Presently prohibited trade', { exact: true })
    .fill('Invented currently prohibited trade');
  await page
    .getByLabel('District boundary and source reference', { exact: true })
    .fill('Invented district source');
  await page
    .getByLabel('No-new-harm analysis', { exact: true })
    .fill('Invented review of lawful jobs, licenses, contracts, customers, queues and markets.');
  await page.getByLabel('Prospective flat-rate act', { exact: true }).fill('SYNTHETIC-NOT-ENACTED');
  await page
    .getByLabel('Common calculation and baseline version', { exact: true })
    .fill('synthetic-method-v1');
  await expect(page.getByLabel('Published rate numerator', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Published rate denominator', { exact: true })).toHaveValue('');
  await page.getByLabel('Published rate numerator', { exact: true }).fill('1');
  await page.getByLabel('Published rate denominator', { exact: true }).fill('20');
  await page.getByText('Protected baseline in the proposed state act', { exact: true }).click();
  await page
    .getByLabel('Bounded negotiable commercial menu', { exact: true })
    .fill('{"trainingVenue":["Invented district center"]}');
  await page
    .getByLabel('Express federal authorization, if needed', { exact: true })
    .fill('Invented preparation only; no legal authorization asserted.');
  await capture(page, `test-results/private-financial-terms-${info.project.name}.png`);
  await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
  await expect(page.getByText('Simulation receipt · version 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await expect(page.getByLabel('Published rate denominator', { exact: true })).toHaveValue('20');
  const records = await (await page.request.get('/api/private/records')).json();
  const saved = records.records.find(
    (r: { title: string }) => r.title === 'Invented financial offer ' + info.project.name,
  );
  expect(saved.data.financialTerms).toEqual({
    version: 'synthetic-method-v1',
    rateActId: 'SYNTHETIC-NOT-ENACTED',
    rate: { numerator: '1', denominator: '20' },
    workingCapitalMonths: 6,
    ordinaryHorizonMonths: 36,
    growthLimit: { numerator: '1', denominator: '2' },
  });
  expect(saved.data.rateAct).toBe(saved.data.financialTerms.rateActId);
  expect(saved.data.financialVersion).toBe(saved.data.financialTerms.version);
});
test('a guided cash schedule reaches assigned calculation and member review', async ({
  page,
}, info) => {
  await signIn(page, 'member');
  await start(page, 'Annual state-share schedule');
  const title = 'Invented guided cash schedule ' + info.project.name;
  await page.getByLabel('Record title').fill(title);
  await page
    .getByLabel('Effective compact', { exact: true })
    .selectOption({ label: 'Invented finance compact · effective' });
  await page.getByLabel('Fiscal year', { exact: true }).fill('2026');
  await page.getByLabel('Fiscal year-end date', { exact: true }).fill('2026-12-31');
  await page.getByLabel('Gross cash receipts (USD)', { exact: true }).fill('1000.00');
  await page.getByRole('button', { name: 'Add costs entry', exact: true }).click();
  const entry = page.locator('.finance-entry').first();
  await entry.getByLabel('Ledger entry reference', { exact: true }).fill('invented-operating');
  await entry.getByLabel('Underlying source reference', { exact: true }).fill('invented-payment');
  await entry.getByLabel('Cash paid (USD)', { exact: true }).fill('100.00');
  await entry.getByLabel('Supported eligible amount (USD)', { exact: true }).fill('100.00');
  await entry.getByLabel('Independently supportable arm’s-length amount', { exact: true }).check();
  await page
    .getByLabel('Previously deducted source references (optional)', { exact: true })
    .fill('invented-old-1\ninvented-old-2');
  await capture(page, `test-results/private-cash-schedule-${info.project.name}.png`);
  await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
  await expect(page.getByText('Simulation receipt · version 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await expect(
    page.getByLabel('Previously deducted source references (optional)', { exact: true }),
  ).toHaveValue('invented-old-1\ninvented-old-2');
  await page.getByRole('button', { name: 'Cancel editing', exact: true }).click();
  await page.getByLabel('I confirm this submission is complete and accurate').check();
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(page.getByText('Simulation receipt · version 2', { exact: true })).toBeVisible();
  await signIn(page, 'fiscal', true);
  await page.getByLabel('Find a record', { exact: true }).fill(title);
  await page.locator('.task-card').getByRole('button', { name: 'Open', exact: true }).click();
  await page
    .getByLabel('Synthetic calculation notice date', { exact: true })
    .fill(new Date().toISOString().slice(0, 10));
  await page
    .getByLabel('Synthetic calculation notice reference', { exact: true })
    .fill('Invented calculation notice; no legal service');
  await page.getByRole('button', { name: 'Calculate published state share', exact: true }).click();
  await expect(page.getByText('Simulation receipt · version 3', { exact: true })).toBeVisible();
  await expect(page.locator('.calculation-summary')).toContainText('45.00');
  await expect(page.locator('.calculation-summary')).toContainText('900.00');
  await capture(page, `test-results/private-finance-result-${info.project.name}.png`);
  await signIn(page, 'member');
  await page.getByLabel('Find a record', { exact: true }).fill(title);
  await page.locator('.task-card').getByRole('button', { name: 'Open', exact: true }).click();
  const appeal = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Appeal calculation', exact: true }) });
  await appeal.getByLabel('Amount disputed in this calculation', { exact: true }).fill('5.00');
  await appeal
    .getByLabel('Written reasons', { exact: true })
    .fill('Invented request to review the operating input under the same published rate.');
  await appeal.getByRole('button', { name: 'Appeal calculation', exact: true }).click();
  await expect(page.getByText('Simulation receipt · version 4', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review requested', exact: true })).toBeVisible();
});
