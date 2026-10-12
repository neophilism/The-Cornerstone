import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { addCalendarDays } from '@cornerstone/domain';
import { Simulation, findings } from '../helpers/simulation.js';
async function capture(page: Page, name: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.screenshot({ path: 'test-results/' + name + '.png', fullPage: true });
}
test('members share an immutable voluntary plan, vote on its exact terms and record adoption', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const w = await new Simulation().connect();
  try {
    const member = await w.persona('member'),
      other = await w.person(),
      labor = await w.persona('labor');
    const group = await w.association(
      member,
      other,
      labor,
      'Invented planning association ' + randomUUID(),
    );
    await page.goto('/');
    await page.getByRole('button', { name: 'member · synthetic development', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Your next step, made clear.', exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Members & enterprise', exact: true }).click();
    await page
      .locator('.workflow-card')
      .filter({ has: page.getByRole('heading', { name: 'Opportunity preparation', exact: true }) })
      .getByRole('button', { name: 'Start draft', exact: true })
      .click();
    const title = 'Invented governed plan ' + info.project.name;
    await page.getByLabel('Record title', { exact: true }).fill(title);
    await page
      .getByLabel('Proposed trade', { exact: true })
      .fill('Invented new lawful opportunity');
    await page.getByLabel('Proposed district', { exact: true }).fill('Invented district');
    await page.getByLabel('Feasibility evidence', { exact: true }).fill(findings);
    await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
    await page
      .getByLabel('I confirm this submission is complete and accurate', { exact: false })
      .check();
    await page.getByRole('button', { name: 'Finish preparation', exact: true }).click();
    const panel = page.locator('.action-panel').filter({
      has: page.getByRole('heading', { name: 'Share a plan with founding members', exact: true }),
    });
    await panel.getByLabel('Association', { exact: true }).selectOption(group.association.id);
    await panel
      .getByLabel('Accessible training and first opportunities', { exact: true })
      .fill('Invented accessible first opportunities and entirely optional training.');
    await panel
      .getByLabel('Feasible enterprise financing plan', { exact: true })
      .fill('Invented enterprise funding path with no personal debt.');
    await panel
      .getByLabel('Ordinary permits and legal prerequisites', { exact: true })
      .fill('Invented permit pathway; no current license or authority.');
    for (const checkbox of await panel.getByRole('checkbox').all()) await checkbox.check();
    await panel
      .getByRole('button', { name: 'Share a plan with founding members', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'A member plan, not permission to operate', exact: true }),
    ).toBeVisible();
    await capture(page, 'private-member-plan-proposed-' + info.project.name);
    const plan = (await w.store.list(await w.actor(member.id))).find(
      (r) => r.kind === 'opportunity' && r.title === title,
    )!;
    expect(plan).toBeTruthy();
    await page.getByRole('button', { name: 'Start a vote on this plan', exact: true }).click();
    await expect(page.getByLabel('Reserved decision', { exact: true })).toHaveValue(
      'opportunity_plan',
    );
    await expect(page.getByLabel('Proposed opportunity (optional)', { exact: true })).toHaveValue(
      plan.id,
    );
    await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'The exact plan this vote covers', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Voting closes', { exact: true }).fill(w.today);
    await page.getByRole('button', { name: 'Open member vote', exact: true }).click();
    await page.getByLabel('Your vote', { exact: true }).selectOption('yes');
    await page.getByRole('button', { name: 'Save my ballot', exact: true }).click();
    await expect(page.getByText('Your saved ballot: yes', { exact: true })).toBeVisible();
    await capture(page, 'private-member-plan-bound-' + info.project.name);
    const resolution = (await w.store.list(await w.actor(member.id))).find(
      (r) => r.kind === 'resolution' && r.data['opportunityId'] === plan.id,
    )!;
    await w.command(other, resolution, 'record_vote', {
      unitId: group.secondUnit.id,
      choice: 'yes',
    });
    w.day = addCalendarDays(w.today, 1);
    await w.command(labor, resolution, 'tally');
    w.day = w.today;
    await page.getByRole('button', { name: 'Open the shared plan', exact: true }).click();
    const adoption = page.locator('.action-panel').filter({
      has: page.getByRole('heading', { name: 'Record the approved member plan', exact: true }),
    });
    // The selected plan fetch is fresh; a supplied reference is still checked against the tallied decision server-side.
    const select = adoption.getByLabel('Approved member resolution', { exact: true });
    await select.selectOption(resolution.id);
    await adoption
      .getByRole('button', { name: 'Record the approved member plan', exact: true })
      .click();
    await expect(
      page.getByText('Member plan adopted in simulation.', { exact: true }),
    ).toBeVisible();
    await capture(page, 'private-member-plan-adopted-' + info.project.name);
    expect((await w.get(member, plan.id))!.data['operatingAuthority']).toBe(false);
  } finally {
    await w.close();
  }
});
