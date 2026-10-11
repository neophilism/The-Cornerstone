import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { Simulation, findings } from '../helpers/simulation.js';
async function signIn(page: Page, persona: string, staff = false) {
  const origin = 'http://127.0.0.1:' + (staff ? '3002' : '3001');
  await page.goto(origin);
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
test('a personally requested successor keeps one unit without inheriting a private ballot or account', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const w = await new Simulation().connect();
  try {
    const first = await w.persona('participant'),
      second = await w.persona('member'),
      labor = await w.persona('labor');
    const { association, firstUnit } = await w.association(
      first,
      second,
      labor,
      'Invented succession browser association ' + info.project.name,
    );
    const resolution = await w.resolution(
      first,
      association,
      'Invented inherited used vote ' + info.project.name,
    );
    await w.command(first, resolution, 'record_vote', { unitId: firstUnit.id, choice: 'yes' });
    await signIn(page, 'successor');
    await page
      .locator('.workflow-card')
      .filter({ has: page.getByRole('heading', { name: 'Single-successor request', exact: true }) })
      .getByRole('button', { name: 'Start draft' })
      .click();
    const title = 'Invented personal succession ' + info.project.name;
    await page.getByLabel('Record title', { exact: true }).fill(title);
    await page.getByLabel('Existing founding unit reference', { exact: true }).fill(firstUnit.id);
    await page.getByLabel('Succession route', { exact: true }).selectOption('member_death');
    await page
      .getByLabel('Requested capacity', { exact: true })
      .selectOption('designated_successor');
    await page.getByLabel('Succession evidence and chain', { exact: true }).fill(findings);
    await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'One unit, not another vote', exact: true }),
    ).toBeVisible();
    await page.getByText('Attach a synthetic text file', { exact: true }).click();
    await page
      .getByLabel('Synthetic text file', { exact: true })
      .setInputFiles({
        name: 'invented-succession.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(findings),
      });
    await page
      .getByLabel('What this item shows', { exact: true })
      .fill('Invented death and designation chain; no real probate proof.');
    await page
      .getByLabel('I am using invented development information only.', { exact: true })
      .check();
    await page.getByRole('button', { name: 'Save quarantined attachment', exact: true }).click();
    await page.getByRole('button', { name: 'Validate synthetic text', exact: true }).click();
    await page
      .getByLabel('I confirm this submission is complete and accurate', { exact: false })
      .check();
    await page.getByLabel('I request one undivided unit', { exact: false }).check();
    await page.getByRole('button', { name: 'Submit my succession request', exact: true }).click();
    await expect(page.getByText('Submitted for assigned review', { exact: true })).toBeVisible();
    await capture(page, `test-results/private-succession-request-${info.project.name}.png`);
    await signIn(page, 'labor', true);
    await page
      .locator('.task-card')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
      .getByRole('button', { name: 'Open', exact: true })
      .click();
    await page.getByRole('button', { name: 'Begin assigned review', exact: true }).click();
    const panel = page
      .locator('.action-panel')
      .filter({
        has: page.getByRole('heading', { name: 'Approve one synthetic successor', exact: true }),
      });
    for (const checkbox of await panel.getByRole('checkbox').all()) await checkbox.check();
    await panel
      .getByLabel('Bylaw, probate, notice and review basis', { exact: true })
      .fill(findings);
    await panel.getByLabel('Written reasons', { exact: true }).fill(findings);
    await capture(page, `test-results/private-succession-review-${info.project.name}.png`);
    await panel
      .getByRole('button', { name: 'Approve one synthetic successor', exact: true })
      .click();
    await expect(
      page.getByText(
        'Synthetic holder updated; the existing unit and any used votes remain unchanged.',
        { exact: true },
      ),
    ).toBeVisible();
    const origin = await signIn(page, 'successor');
    await page.getByRole('link', { name: 'Membership & votes', exact: true }).click();
    await page
      .locator('.activity-card')
      .filter({ has: page.getByRole('heading', { name: resolution.title, exact: true }) })
      .getByRole('button', { name: 'Review decision', exact: true })
      .click();
    await expect(
      page.getByText('This founding unit has already voted.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Your saved ballot: yes', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save my ballot', exact: true })).toHaveCount(0);
    await capture(page, `test-results/private-succession-used-vote-${info.project.name}.png`);
    const me = await (await page.request.get(origin + '/api/private/me')).json();
    const current = (
      await (
        await page.request.get(origin + '/api/private/records?recordId=' + resolution.id)
      ).json()
    ).records[0];
    const rejected = await page.request.post(origin + '/api/private/commands', {
      headers: { Origin: origin, 'X-CSRF-Token': me.csrf },
      data: {
        recordId: resolution.id,
        expectedVersion: current.version,
        idempotencyKey: randomUUID(),
        action: 'record_vote',
        input: { unitId: firstUnit.id, choice: 'no' },
      },
    });
    expect(rejected.status()).toBe(422);
    expect(JSON.stringify(await rejected.json())).toContain('DUPLICATE_BALLOT');
    const privateClaim = await (
      await page.request.get(origin + '/api/private/records?recordId=' + firstUnit.claim_id)
    ).json();
    expect(privateClaim.records).toEqual([]);
    await page.reload();
    const view = await (
      await page.request.get(origin + '/api/private/governance?recordId=' + resolution.id)
    ).json();
    expect(view.ownBallots).toEqual([]);
    expect(view.castUnits).toEqual([firstUnit.id]);
    await signIn(page, 'participant');
    const former = await (
      await page.request.get(origin + '/api/private/records?recordId=' + association.id)
    ).json();
    expect(former.records).toEqual([]);
  } finally {
    await w.close();
  }
});
