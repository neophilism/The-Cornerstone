import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Simulation, findings } from '../helpers/simulation.js';
import { eventFixture } from '../helpers/claim-fixtures.js';
import { deceasedFilingFixture } from '../helpers/deceased-filings.js';

async function signIn(page: Page, persona: string, staff = false) {
  const origin = 'http://127.0.0.1:' + (staff ? '3002' : '3001');
  await page.goto(origin);
  await expect(
    page.getByRole('heading', {
      name: /^(Your private workspace\.|Your next step, made clear\.)$/,
    }),
  ).toBeVisible();
  if (await page.getByRole('button', { name: 'Sign out', exact: true }).count())
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page
    .getByRole('button', { name: persona + ' · synthetic development', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Your next step, made clear.' })).toBeVisible();
  return origin;
}
async function openReference(page: Page, id: string) {
  await page.getByRole('link', { name: 'My records', exact: true }).click();
  await page.getByText('Open a record by reference', { exact: true }).click();
  await page.getByLabel('Record reference', { exact: true }).fill(id);
  await page.getByRole('button', { name: 'Open reference', exact: true }).click();
}
async function capture(page: Page, path: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations.map((violation) => violation.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.screenshot({ path, fullPage: true });
}

test('personal standing opens one deceased-worker eligibility draft and recovers a lost opening response', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const w = await new Simulation().connect();
  try {
    const applicant = await w.persona('successor'),
      worker = await w.person(),
      labor = await w.persona('labor');
    const event = await eventFixture(w, applicant, labor);
    const unrelated = await w.create(worker, 'dossier', 'Invented unrelated worker preparation', {
      actionDescription: findings,
      livelihood: findings,
      lossDescription: findings,
    });
    const origin = await signIn(page, 'successor');
    await page.getByRole('link', { name: 'Prepare & participate', exact: true }).click();
    await page
      .locator('.workflow-card')
      .filter({
        has: page.getByRole('heading', { name: 'New deceased-worker filing', exact: true }),
      })
      .getByRole('button', { name: 'Start draft' })
      .click();
    const title = 'Invented deceased-worker preparation ' + info.project.name;
    await page.getByLabel('Record title', { exact: true }).fill(title);
    await page
      .getByLabel('Synthetic deceased-worker identity reference', { exact: true })
      .fill(worker.id);
    await page
      .getByLabel('Requested filing capacity', { exact: true })
      .selectOption('estate_representative');
    await page
      .getByLabel('Death, designation and succession chain', { exact: true })
      .fill(findings);
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/private/records') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
    const packetId = (await (await created).json()).record.id as string;
    await expect(
      page.getByRole('heading', { name: 'One worker, one undivided claim', exact: true }),
    ).toBeVisible();
    expect(
      (await page.request.get(origin + '/api/private/records?recordId=' + unrelated.id)).status(),
    ).toBe(404);
    await page.getByText('Attach a synthetic text file', { exact: true }).click();
    await page.getByLabel('Synthetic text file', { exact: true }).setInputFiles({
      name: 'invented-standing.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(findings),
    });
    await page
      .getByLabel('What this item shows', { exact: true })
      .fill('Invented death, identity and estate authority; not worker eligibility evidence.');
    await page
      .getByLabel('I am using invented development information only.', { exact: true })
      .check();
    await page.getByRole('button', { name: 'Save quarantined attachment', exact: true }).click();
    await expect(
      page.getByText('Quarantined · download unavailable', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Validate synthetic text', exact: true }).click();
    await expect(page.getByText('Synthetic text checked', { exact: true })).toBeVisible();
    await page
      .getByLabel('I confirm this submission is complete and accurate', { exact: false })
      .check();
    await page
      .getByLabel('I request one new undivided claim for the worker', { exact: false })
      .check();
    await page
      .getByRole('button', { name: 'Submit my deceased-worker filing packet', exact: true })
      .click();
    await expect(page.getByText('Submitted for assigned review', { exact: true })).toBeVisible();
    await capture(page, `test-results/private-deceased-filing-request-${info.project.name}.png`);

    await signIn(page, 'labor', true);
    await openReference(page, packetId);
    await page.getByRole('button', { name: 'Begin assigned review', exact: true }).click();
    const review = page.locator('form.action-panel').filter({
      has: page.getByRole('heading', {
        name: 'Approve standing to file one new claim',
        exact: true,
      }),
    });
    await expect(review).toBeVisible();
    for (const checkbox of await review.getByRole('checkbox').all()) await checkbox.check();
    await review
      .getByLabel('Succession, case-access, notice and review basis', { exact: true })
      .fill(findings);
    await review.getByLabel('Written reasons', { exact: true }).fill(findings);
    await review
      .getByRole('button', { name: 'Approve standing to file one new claim', exact: true })
      .click();
    await expect(
      page.getByText('Standing recorded; eligibility is still unproved.', { exact: true }),
    ).toBeVisible();
    expect(
      await page
        .getByRole('button', { name: 'Prepare the worker’s eligibility claim', exact: true })
        .count(),
    ).toBe(0);

    await signIn(page, 'successor');
    await openReference(page, packetId);
    const preparation = page.locator('form.action-panel').filter({
      has: page.getByRole('heading', {
        name: 'Prepare the worker’s eligibility claim',
        exact: true,
      }),
    });
    await preparation.getByLabel('Certified event', { exact: true }).selectOption(event.id);
    await preparation.getByLabel('Livelihood role', { exact: true }).selectOption('employee');
    await preparation
      .getByLabel('Share of the worker’s earned income (%) (optional)', { exact: true })
      .fill('75');
    await preparation
      .getByLabel('Direct material injury', { exact: true })
      .fill('Invented original worker livelihood loss; separate from estate standing.');
    await preparation.getByLabel('Attributable loss date', { exact: true }).fill('2000-02-01');
    await capture(
      page,
      `test-results/private-deceased-filing-preparation-${info.project.name}.png`,
    );
    const wires: string[] = [];
    let accepted: any;
    await page.route('**/api/private/commands', async (route) => {
      const input = route.request().postDataJSON();
      if (input.recordId !== packetId || input.action !== 'open_claim') return route.continue();
      wires.push(route.request().postData()!);
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      if (wires.length === 1) {
        accepted = await response.json();
        return route.fulfill({
          status: 502,
          json: { code: 'UPSTREAM_UNCERTAIN', message: 'Synthetic lost response after commit.' },
        });
      }
      return route.fulfill({ response });
    });
    await preparation
      .getByRole('button', { name: 'Prepare the worker’s eligibility claim', exact: true })
      .click();
    await expect(preparation.getByRole('alert')).toContainText('action outcome is unknown');
    await expect(preparation.getByLabel('Direct material injury', { exact: true })).toBeDisabled();
    await preparation.getByRole('button', { name: 'Retry exact action', exact: true }).click();
    await expect(
      page.getByText('The worker’s eligibility draft is ready to prepare.', { exact: true }),
    ).toBeVisible();
    expect(wires).toHaveLength(2);
    expect(new Set(wires).size).toBe(1);
    const claimId = String(accepted.record.data.openedClaimId);
    expect(
      (
        await w.owner.query(
          'SELECT count(*)::int AS n FROM deceased_filing_claims WHERE request_id=$1',
          [packetId],
        )
      ).rows[0].n,
    ).toBe(1);
    await page
      .getByRole('button', { name: 'Open the worker’s eligibility draft', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Prove the original worker’s eligibility', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Individual eligibility: ' + title, exact: true }),
    ).toBeVisible();
    await capture(page, `test-results/private-deceased-filing-claim-${info.project.name}.png`);
    const claim = (await w.get(applicant, claimId))!;
    expect(claim.state).toBe('draft');
    expect(claim.data.earnedIncomeShare).toBe(0.75);
    expect((claim.data.claimControl as Record<string, unknown>).originalWorkerId).toBe(worker.id);
    expect((await w.evidence.list(applicant, claimId)).evidence).toHaveLength(0);
    expect(
      (await page.request.get(origin + '/api/private/records?recordId=' + unrelated.id)).status(),
    ).toBe(404);
    expect(await w.get(worker, claimId)).toBeNull();
    expect(await w.get(labor, claimId)).toBeNull();
  } finally {
    await w.close();
  }
});

test('approved unused standing can be withdrawn from the private workspace', async ({ page }) => {
  const w = await new Simulation().connect();
  try {
    const applicant = await w.persona('successor'),
      worker = await w.person(),
      labor = await w.persona('labor');
    const packet = await deceasedFilingFixture(w, applicant, worker, labor);
    await w.command(labor, packet.record, 'approve', packet.input);
    await signIn(page, 'successor');
    await openReference(page, packet.record.id);
    const withdrawal = page.locator('form.action-panel').filter({
      has: page.getByRole('heading', {
        name: 'Withdraw my unused standing decision',
        exact: true,
      }),
    });
    await expect(withdrawal).toBeVisible();
    await withdrawal.getByLabel('Written reasons', { exact: true }).fill(findings);
    await withdrawal
      .getByRole('button', { name: 'Withdraw my unused standing decision', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Prepare the worker’s eligibility claim', exact: true }),
    ).toHaveCount(0);
    expect((await w.get(applicant, packet.record.id))!.state).toBe('withdrawn');
    expect(
      (
        await w.owner.query(
          'SELECT count(*)::int n FROM deceased_filing_withdrawals WHERE request_id=$1',
          [packet.record.id],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await w.owner.query(
          'SELECT count(*)::int n FROM deceased_filing_claims WHERE request_id=$1',
          [packet.record.id],
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await w.close();
  }
});
