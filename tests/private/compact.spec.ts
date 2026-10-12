import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { addCalendarDays } from '@cornerstone/domain';
import { Simulation } from '../helpers/simulation.js';
import { compactPrerequisites, compactDraftDetails } from '../helpers/compact-fixture.js';
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
test('members choose every published term, inspect the exact compact ballot and submit only that approval', async ({
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
      'Invented compact browser association ' + randomUUID(),
    );
    // Only downstream prerequisites are fixtures: no actual authority or exchange acceptance is established.
    const prerequisites = await compactPrerequisites(w, member, group.association);
    await page.goto('/');
    await page.getByRole('button', { name: /^member .* synthetic development$/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Your next step, made clear.', exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Members & enterprise', exact: true }).click();
    await page
      .locator('.workflow-card')
      .filter({ has: page.getByRole('heading', { name: 'Negotiated compact', exact: true }) })
      .getByRole('button', { name: 'Start draft', exact: true })
      .click();
    const title = 'Invented complete compact ' + info.project.name;
    await page.getByLabel('Record title', { exact: true }).fill(title);
    await page.getByLabel('Published offer', { exact: true }).selectOption(prerequisites.offer.id);
    await page.getByLabel('Ready association', { exact: true }).selectOption(group.association.id);
    await page.getByLabel('Accepted match', { exact: true }).selectOption(prerequisites.match.id);
    const lease = page.getByLabel('Lease', { exact: true }),
      reporting = page.getByLabel('Reporting', { exact: true });
    await expect(lease).toHaveValue('');
    await expect(reporting).toHaveValue('');
    await lease.selectOption({ label: 'Standard (string)' });
    await reporting.selectOption({ label: 'Quarterly (string)' });
    await page
      .getByLabel('Services and service obligations (optional)', { exact: true })
      .fill(compactDraftDetails.services);
    await page
      .getByLabel('Launch milestones and deadlines (optional)', { exact: true })
      .fill(compactDraftDetails.launchMilestones);
    await page
      .getByLabel('Public protections and ordinary law obligations (optional)', { exact: true })
      .fill(compactDraftDetails.publicProtections);
    await capture(page, 'private-compact-choices-' + info.project.name);
    await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Approval follows the exact compact terms', exact: true }),
    ).toBeVisible();
    const compact = (await w.store.list(await w.actor(member.id))).find(
      (r) => r.kind === 'compact' && r.title === title,
    )!;
    expect(compact).toBeTruthy();
    expect(compact.data['terms']).toEqual(compactDraftDetails.terms);
    await page.getByRole('button', { name: 'Start a vote on this compact', exact: true }).click();
    await expect(page.getByLabel('Reserved decision', { exact: true })).toHaveValue('compact');
    await expect(page.getByLabel('Proposed compact (optional)', { exact: true })).toHaveValue(
      compact.id,
    );
    const disclosure = page.getByLabel(
      'Allow all founding members to inspect the frozen compact terms when voting opens',
      { exact: true },
    );
    await expect(disclosure).not.toBeChecked();
    await disclosure.check();
    await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'The exact compact this vote covers', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Voting closes', { exact: true }).fill(w.today);
    await page.getByRole('button', { name: 'Open member vote', exact: true }).click();
    await page.getByLabel('Your vote', { exact: true }).selectOption('yes');
    await page.getByRole('button', { name: 'Save my ballot', exact: true }).click();
    await expect(page.getByText('Your saved ballot: yes', { exact: true })).toBeVisible();
    await capture(page, 'private-compact-bound-' + info.project.name);
    const resolution = (await w.store.list(await w.actor(member.id))).find(
      (r) => r.kind === 'resolution' && r.data['compactId'] === compact.id,
    )!;
    expect(resolution).toBeTruthy();
    expect(await w.get(other, compact.id)).toBeNull();
    expect((await w.get(other, resolution.id))!.data['compactBinding']).toBeTruthy();
    await w.command(other, resolution, 'record_vote', {
      unitId: group.secondUnit.id,
      choice: 'yes',
    });
    w.day = addCalendarDays(w.today, 1);
    await w.command(labor, resolution, 'tally');
    w.day = w.today;
    await page.reload();
    await page.getByRole('link', { name: 'My records', exact: true }).click();
    await page
      .locator('.task-card')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
      .getByRole('button', { name: 'Open', exact: true })
      .click();
    const submission = page
      .locator('.action-panel')
      .filter({
        has: page.getByRole('heading', { name: 'Submit compact for review', exact: true }),
      });
    await submission
      .getByLabel('Approved compact resolution', { exact: true })
      .selectOption(resolution.id);
    await submission
      .getByLabel('I confirm this submission is complete and accurate', { exact: false })
      .check();
    await submission
      .getByRole('button', { name: 'Submit compact for review', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'The exact compact members approved', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        'Recorded approval: 2 yes votes out of all 2 founding units. Separate private ballots are not disclosed.',
        { exact: true },
      ),
    ).toBeVisible();
    await capture(page, 'private-compact-submitted-' + info.project.name);
    expect((await w.get(member, compact.id))!.state).toBe('submitted');
  } finally {
    await w.close();
  }
});
