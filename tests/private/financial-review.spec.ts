import { test, expect, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { Simulation } from '../helpers/simulation.js';
import { financialReviewFixture } from '../helpers/financial-review-fixture.js';

async function signIn(page: Page, persona: string, staff = false) {
  await page.goto('http://127.0.0.1:' + (staff ? '3002' : '3001'));
  await expect(
    page.getByRole('heading', {
      name: /^(Your private workspace\.|Your next step, made clear\.)$/,
    }),
  ).toBeVisible();
  if (await page.getByRole('button', { name: 'Sign out', exact: true }).count()) {
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Your private workspace.', exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole('button', { name: persona + ' · synthetic development', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your next step, made clear.', exact: true }),
  ).toBeVisible();
}
async function open(page: Page, recordId: string) {
  await page.getByRole('link', { name: 'My records', exact: true }).click();
  await page.getByText('Open a record by reference', { exact: true }).click();
  await page.getByLabel('Record reference', { exact: true }).fill(recordId);
  await page.getByRole('button', { name: 'Open reference', exact: true }).click();
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
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.screenshot({ path, fullPage: true });
}

test('a member reaches an independent reasoned calculation decision with closed evidence and exact recovery', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const w = await new Simulation().connect();
  try {
    const member = await w.persona('member'),
      fiscal = await w.persona('fiscal');
    const { calculated } = await financialReviewFixture(w, member, fiscal);
    await signIn(page, 'member');
    await open(page, calculated.id);
    const appeal = page
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Appeal calculation', exact: true }) });
    await appeal.getByLabel('Amount disputed in this calculation', { exact: true }).fill('5.00');
    await appeal
      .getByLabel('Written reasons', { exact: true })
      .fill('Invented receipt supports correcting operating cost under the same published method.');
    await appeal.getByRole('button', { name: 'Appeal calculation', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Your calculation appeal', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.financial-review-summary')).toContainText('40.00');
    await expect(
      page.getByRole('button', { name: 'Schedule independent calculation review', exact: true }),
    ).toHaveCount(0);
    await page.getByText('Attach a synthetic text file', { exact: true }).click();
    await page.getByLabel('Synthetic text file', { exact: true }).setInputFiles({
      name: 'invented-cash-review.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        'Invented cash receipt: supported operating amount USD 200.00. No actual payment.',
      ),
    });
    await page
      .getByLabel('What this item shows', { exact: true })
      .fill('Invented corrected operating cash receipt for the independent hearing.');
    await page
      .getByLabel('I am using invented development information only.', { exact: true })
      .check();
    await page.getByRole('button', { name: 'Save quarantined attachment', exact: true }).click();
    await expect(
      page.getByText('Quarantined · download unavailable', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Validate synthetic text', exact: true }).click();
    await expect(page.getByText('Synthetic text checked', { exact: true })).toBeVisible();
    await capture(page, `test-results/private-financial-appeal-${info.project.name}.png`);

    await signIn(page, 'fiscal', true);
    expect(
      (
        await page.request.get(
          'http://127.0.0.1:3002/api/private/records?recordId=' + calculated.id,
        )
      ).status(),
    ).toBe(404);
    await signIn(page, 'adjudicator', true);
    await open(page, calculated.id);
    await page.getByLabel('Synthetic hearing date', { exact: true }).fill(w.today);
    await page
      .getByLabel('Synthetic hearing notice reference', { exact: true })
      .fill('Invented independent hearing notice; not legal service');
    await page
      .getByRole('button', { name: 'Schedule independent calculation review', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Independent calculation review is scheduled',
        exact: true,
      }),
    ).toBeVisible();
    const hearing = page.locator('form').filter({
      has: page.getByRole('button', { name: 'Record hearing and close evidence', exact: true }),
    });
    await hearing
      .getByLabel('Synthetic hearing record', { exact: true })
      .fill(
        'Invented hearing considered the source receipt, contrary classification and the original rate and method.',
      );
    await hearing.getByRole('checkbox').check();
    await hearing
      .getByRole('button', { name: 'Record hearing and close evidence', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'The hearing record is ready for decision', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Attach a synthetic text file', { exact: true })).toHaveCount(0);
    await page.getByText('Prepare the calculation review decision', { exact: true }).click();
    const decision = page.locator('form').filter({
      has: page.getByRole('button', {
        name: 'Record reasoned calculation decision',
        exact: true,
      }),
    });
    await decision.getByLabel('Calculation decision', { exact: true }).selectOption('correct');
    await expect(decision.getByLabel('Gross cash receipts (USD)', { exact: true })).toHaveValue(
      '1000.00',
    );
    const cost = decision.locator('.finance-entry').first();
    await cost.getByLabel('Cash paid (USD)', { exact: true }).fill('200.00');
    await cost.getByLabel('Supported eligible amount (USD)', { exact: true }).fill('200.00');
    await decision
      .getByLabel('Written reasons', { exact: true })
      .fill(
        'Invented evidence supports the revised operating input. The published rate and allowance method remain unchanged.',
      );
    await decision
      .getByLabel('Available judicial review route', { exact: true })
      .fill(
        'Invented competent court review route; no court filing or legal service is performed by this simulation.',
      );
    await capture(page, `test-results/private-financial-hearing-${info.project.name}.png`);
    const wires: string[] = [];
    let committedVersion: number | undefined;
    await page.route('**/api/private/commands', async (route) => {
      const input = route.request().postDataJSON();
      if (input.recordId !== calculated.id || input.action !== 'decide_calculation_review')
        return route.continue();
      wires.push(route.request().postData()!);
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      if (wires.length === 1) {
        committedVersion = (await response.json()).record.version;
        return route.abort('failed');
      }
      await route.fulfill({ response });
    });
    await decision
      .getByRole('button', { name: 'Record reasoned calculation decision', exact: true })
      .click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'The action outcome is unknown.' }),
    ).toBeVisible();
    await expect(
      decision.getByRole('button', { name: 'Record reasoned calculation decision', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Retry exact action', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Calculation review decision', exact: true }),
    ).toBeVisible();
    expect(wires).toHaveLength(2);
    expect(new Set(wires).size).toBe(1);
    await expect(page.locator('.financial-review-summary')).toContainText('-5.00');
    await signIn(page, 'member');
    await open(page, calculated.id);
    await expect(
      page.getByRole('heading', { name: 'Calculation review decision', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.financial-review-summary')).toContainText('45.00');
    await expect(page.locator('.financial-review-summary')).toContainText('40.00');
    await expect(page.getByText('Attach a synthetic text file', { exact: true })).toHaveCount(0);
    await capture(page, `test-results/private-financial-decision-${info.project.name}.png`);
    const current = (
      await (await page.request.get('/api/private/records?recordId=' + calculated.id)).json()
    ).records[0];
    expect(current.version).toBe(committedVersion);
    expect(current.data.financialReview.decision.hearingRecordVersion).toBe(current.version - 1);
    expect(current.data.financialReview.originalCalculation.statePayment).toBe('45.00');
    expect(current.data.calculation.statePayment).toBe('40.00');
    expect(current.data.financialReview.basis.terms.rate).toEqual({
      numerator: '1',
      denominator: '20',
    });
  } finally {
    await w.close();
  }
});
