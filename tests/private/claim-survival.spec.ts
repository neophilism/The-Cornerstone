import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Simulation, findings } from '../helpers/simulation.js';
import { eventFixture, claimFixture } from '../helpers/claim-fixtures.js';
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
test('a surviving claimant obtains only the continuing claim file after a separate assigned decision', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const w = await new Simulation().connect();
  try {
    const worker = await w.persona('participant'),
      candidate = await w.persona('successor'),
      labor = await w.persona('labor');
    const event = await eventFixture(w, worker, labor);
    const original = await claimFixture(w, worker, labor, event);
    const unrelated = await claimFixture(w, worker, labor, event);
    const origin = await signIn(page, 'successor');
    await page
      .locator('.workflow-card')
      .filter({ has: page.getByRole('heading', { name: 'Surviving claim request', exact: true }) })
      .getByRole('button', { name: 'Start draft' })
      .click();
    const title = 'Invented personal claim survival ' + info.project.name;
    await page.getByLabel('Record title', { exact: true }).fill(title);
    await page.getByLabel('Original claim reference', { exact: true }).fill(original.record.id);
    await page.getByLabel('Claim succession route', { exact: true }).selectOption('holder_death');
    await page
      .getByLabel('Requested claim capacity', { exact: true })
      .selectOption('designated_successor');
    await page
      .getByLabel('Death, designation and succession chain', { exact: true })
      .fill(findings);
    await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'One continuing claim, not a new benefit', exact: true }),
    ).toBeVisible();
    const before = await page.request.get(
      origin + '/api/private/records?recordId=' + original.record.id,
    );
    expect(before.status()).toBe(404);
    await page.getByText('Attach a synthetic text file', { exact: true }).click();
    await page.getByLabel('Synthetic text file', { exact: true }).setInputFiles({
      name: 'invented-claim-survival.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(findings),
    });
    await page
      .getByLabel('What this item shows', { exact: true })
      .fill('Invented death, designation and narrow case-access authority only.');
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
    await page.getByLabel('I request one undivided claim', { exact: false }).check();
    await page
      .getByRole('button', { name: 'Submit my surviving claim request', exact: true })
      .click();
    await expect(page.getByText('Submitted for assigned review', { exact: true })).toBeVisible();
    await capture(page, `test-results/private-claim-survival-request-${info.project.name}.png`);
    await signIn(page, 'labor', true);
    await page
      .locator('.task-card')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
      .getByRole('button', { name: 'Open', exact: true })
      .click();
    await page.getByRole('button', { name: 'Begin assigned review', exact: true }).click();
    const panel = page.locator('.action-panel').filter({
      has: page.getByRole('heading', {
        name: 'Approve case-specific claim survival',
        exact: true,
      }),
    });
    await expect(panel).toBeVisible();
    for (const checkbox of await panel.getByRole('checkbox').all()) await checkbox.check();
    await panel
      .getByLabel('Succession, case-access, notice and review basis', { exact: true })
      .fill(findings);
    await panel.getByLabel('Written reasons', { exact: true }).fill(findings);
    await capture(page, `test-results/private-claim-survival-review-${info.project.name}.png`);
    await panel
      .getByRole('button', { name: 'Approve case-specific claim survival', exact: true })
      .click();
    await expect(
      page.getByText('Claim control updated; eligibility was not changed.', { exact: true }),
    ).toBeVisible();
    await signIn(page, 'successor');
    await page
      .locator('.task-card')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
      .getByRole('button', { name: 'Open', exact: true })
      .click();
    await page.getByRole('button', { name: 'Open the continuing claim', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'The original claim continues', exact: true }),
    ).toBeVisible();
    await capture(
      page,
      `test-results/private-claim-survival-continuation-${info.project.name}.png`,
    );
    const current = (
      await (
        await page.request.get(origin + '/api/private/records?recordId=' + original.record.id)
      ).json()
    ).records[0];
    expect(current.id).toBe(original.record.id);
    expect(current.ownerId).toBe(candidate.id);
    expect(current.state).toBe('eligible');
    expect(current.data.claimControl.originalWorkerId).toBe(worker.id);
    const denied = await page.request.get(
      origin + '/api/private/records?recordId=' + unrelated.record.id,
    );
    expect(denied.status()).toBe(404);
    await signIn(page, 'participant');
    expect(
      (
        await page.request.get(origin + '/api/private/records?recordId=' + original.record.id)
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.get(origin + '/api/private/records?recordId=' + unrelated.record.id)
      ).status(),
    ).toBe(200);
  } finally {
    await w.close();
  }
});
