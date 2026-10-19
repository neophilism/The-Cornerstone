import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Simulation } from '../helpers/simulation.js';
import { submittedAuthority } from '../helpers/state-offer-fixture.js';

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
test('a state publishes independently verified immutable terms, recovers its receipt, and preserves participant inspection after withdrawal', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const w = await new Simulation().connect();
  try {
    const state = await w.persona('state'),
      prepared = await submittedAuthority(w, state);
    await signIn(page, 'supervisor', true);
    await open(page, prepared.record.id);
    const verification = page.locator('form').filter({
      has: page.getByRole('button', { name: 'Record independent verification', exact: true }),
    });
    await verification
      .getByLabel(
        'The synthetic packet documents effective authority, independent appointments, fiscal report, public rules and funded supervision',
        { exact: false },
      )
      .check();
    await verification
      .getByLabel('Written reasons', { exact: true })
      .fill('INTERNAL browser authority verification, excluded from publication.');
    await verification
      .getByRole('button', { name: 'Record independent verification', exact: true })
      .click();
    await expect(page.locator('.state-offer-summary')).toContainText(
      'Exact verified authority and terms',
    );
    await capture(page, `test-results/private-state-authority-${info.project.name}.png`);

    await signIn(page, 'state', true);
    await page
      .locator('.workflow-card')
      .filter({ has: page.getByRole('heading', { name: 'State offer', exact: true }) })
      .getByRole('button', { name: 'Start draft', exact: true })
      .click();
    const title = 'Invented published state offer ' + info.project.name + ' ' + prepared.record.id;
    await page.getByLabel('Record title', { exact: true }).fill(title);
    await page.getByRole('button', { name: 'Use a supplied record ID', exact: true }).click();
    await page
      .getByLabel('Verified state authority packet', { exact: true })
      .fill(prepared.record.id);
    for (const [label, text] of [
      ['Presently prohibited trade', 'Invented prohibited trade'],
      ['District boundary and source reference', 'Invented mapped district'],
      ['No-new-harm analysis', 'INTERNAL browser working analysis, not disclosed'],
      ['Express federal authorization, if needed', 'Invented public authority reference'],
      ['Public technical and financial readiness summary', 'Invented disclosed readiness'],
      ['Public service obligations', 'Invented disclosed service obligations'],
      ['Public launch requirements', 'Invented disclosed launch requirements'],
      ['Public regulatory and tax terms', 'Invented disclosed ordinary rules and taxes'],
      [
        'Public protections and neutral end-of-term regime',
        'Invented disclosed public protections',
      ],
    ])
      await page.getByLabel(label!, { exact: true }).fill(text!);
    await page
      .getByLabel('Prospective flat-rate act', { exact: true })
      .fill(prepared.input.rateAct);
    await page
      .getByLabel('Common calculation and baseline version', { exact: true })
      .fill(prepared.input.financialVersion);
    await page.getByLabel('Published rate numerator', { exact: true }).fill('1');
    await page.getByLabel('Published rate denominator', { exact: true }).fill('20');
    await page
      .getByLabel('Bounded negotiable commercial menu', { exact: true })
      .fill('{"Lease":["Standard","Short"],"Reporting":["Quarterly","Monthly"]}');
    const creationResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/private/records') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
    const created = await (await creationResponse).json(),
      offerId: string = created.record.id;
    await expect(page.getByText('Simulation receipt · version 1', { exact: true })).toBeVisible();
    await page.getByText('Attach a synthetic text file', { exact: true }).click();
    await page.getByLabel('Synthetic text file', { exact: true }).setInputFiles({
      name: 'invented-private-offer.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('PRIVATE browser offer attachment body; never disclosed by catalogue'),
    });
    await page
      .getByLabel('What this item shows', { exact: true })
      .fill('PRIVATE browser offer attachment description');
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
    await page.getByRole('button', { name: 'Submit for independent review', exact: true }).click();
    await expect(page.locator('.state-offer-summary')).toContainText('Submitted offer revision');

    await signIn(page, 'supervisor', true);
    await open(page, offerId);
    await page.getByRole('button', { name: 'Begin assigned review', exact: true }).click();
    const publication = page.locator('form').filter({
      has: page.getByRole('button', { name: 'Approve and publish immutable offer', exact: true }),
    });
    for (const label of [
      'Existing lawful rights and markets are protected',
      'Trade is presently prohibited in the district',
      'Rate, method, baseline and menu were fixed prospectively',
      'Disclose the listed public terms and authority references to signed-in simulation participants',
    ])
      await publication.getByLabel(label, { exact: false }).check();
    await publication
      .getByLabel('Findings disclosed with the published terms', { exact: true })
      .fill('Invented public findings; original rights protected.');
    await publication
      .getByLabel('Written reasons', { exact: true })
      .fill('INTERNAL browser publication deliberation');
    const wires: string[] = [];
    await page.route('**/api/private/commands', async (route) => {
      const input = route.request().postDataJSON();
      if (input.recordId !== offerId || input.action !== 'publish') return route.continue();
      wires.push(route.request().postData()!);
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      if (wires.length === 1) return route.abort('failed');
      await route.fulfill({ response });
    });
    // Fixture setup can cross midnight UTC during a long-running mobile journey.
    // Set today's date immediately before the immutable publication command.
    await publication
      .getByLabel('Synthetic publication date (today)', { exact: true })
      .fill(new Date().toISOString().slice(0, 10));
    await publication
      .getByRole('button', { name: 'Approve and publish immutable offer', exact: true })
      .click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'The action outcome is unknown.' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Retry exact action', exact: true }).click();
    await expect(page.locator('.state-offer-summary')).toContainText(
      'Frozen synthetic publication',
    );
    expect(wires).toHaveLength(2);
    expect(new Set(wires).size).toBe(1);

    await signIn(page, 'member');
    await page.getByRole('link', { name: 'Published offers', exact: true }).click();
    const article = page
      .locator('.published-offers article')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await expect(article).toBeVisible();
    await article.getByText('Inspect immutable terms', { exact: true }).click();
    await expect(article).toContainText('Invented disclosed service obligations');
    await expect(article).toContainText('1 / 20');
    await expect(article).toContainText('Earliest ranking close under this preparation');
    await expect(article).not.toContainText('INTERNAL');
    await expect(article).not.toContainText('PRIVATE');
    const original = (
      await (await page.request.get('/api/private/published-offers?offerId=' + offerId)).json()
    ).offers[0];
    expect((await page.request.get('/api/private/records?recordId=' + offerId)).status()).toBe(404);
    expect((await page.request.get('/api/private/evidence?recordId=' + offerId)).status()).toBe(
      404,
    );
    expect(JSON.stringify(original)).not.toContain('ownerId');
    await capture(page, `test-results/private-state-publication-${info.project.name}.png`);

    await signIn(page, 'state', true);
    await open(page, offerId);
    const withdrawal = page
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Withdraw prospectively', exact: true }) });
    await withdrawal
      .getByLabel('Written reasons', { exact: true })
      .fill('INTERNAL future participation ends; original compact obligations remain.');
    await withdrawal.getByRole('button', { name: 'Withdraw prospectively', exact: true }).click();
    await expect(page.locator('.state-offer-summary')).toContainText('Withdrawn prospectively.');
    await signIn(page, 'member');
    await page.getByRole('link', { name: 'Published offers', exact: true }).click();
    await expect(article).toContainText('Withdrawn for new choices; historical terms preserved.');
    const final = (
      await (await page.request.get('/api/private/published-offers?offerId=' + offerId)).json()
    ).offers[0];
    expect(final.publication).toEqual(original.publication);
    expect(final.digest).toBe(original.digest);
    expect(final.status).toBe('withdrawn');
    await article.getByText('Inspect immutable terms', { exact: true }).click();
    await capture(page, `test-results/private-state-withdrawal-${info.project.name}.png`);
  } finally {
    await w.close();
  }
});
