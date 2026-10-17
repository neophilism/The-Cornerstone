import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { Simulation } from '../helpers/simulation.js';
async function login(page: Page, persona: string) {
  await page.goto('/');
  await page
    .getByRole('button', { name: persona + ' · synthetic development', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your next step, made clear.', exact: true }),
  ).toBeVisible();
}
async function capture(page: Page, name: string) {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/' + name + '.png', fullPage: true });
}
test('lost consent and a denied retry preserve the exact acknowledged response', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const world = await new Simulation().connect();
  try {
    const persona = info.project.name === 'desktop' ? 'participant' : 'member';
    const person = await world.persona(persona),
      other = await world.person(),
      labor = await world.persona('labor');
    const title = 'Invented recoverable consent ' + randomUUID();
    await world.association(person, other, labor, title, false);
    await login(page, persona);
    await page.getByRole('link', { name: 'Membership & votes', exact: true }).click();
    await page
      .locator('.invitation-card')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
      .getByRole('button', { name: 'Review association', exact: true })
      .click();
    const panel = page.locator('.founding-consent');
    await expect(panel.getByText('Your response: pending', { exact: true })).toBeVisible();
    const wires: string[] = [];
    let accepted: any;
    await page.route('**/api/private/memberships/respond', async (route) => {
      wires.push(route.request().postData()!);
      if (wires.length === 2)
        return route.fulfill({ status: 403, json: { message: 'Synthetic denied retry' } });
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      if (wires.length === 1) {
        accepted = await response.json();
        return route.abort('failed');
      }
      return route.fulfill({ response });
    });
    await panel.getByLabel(/^I voluntarily accept these unchanged terms/).check();
    await panel.getByRole('button', { name: 'Accept founding invitation', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('membership outcome is unknown');
    await expect(panel.getByLabel(/^I voluntarily accept these unchanged terms/)).toBeDisabled();
    await panel.getByRole('button', { name: 'Retry exact membership action', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('membership outcome is unknown');
    await expect(
      panel.getByRole('button', { name: 'Decline founding invitation', exact: true }),
    ).toBeDisabled();
    await page.getByRole('link', { name: 'Overview', exact: true }).click();
    await expect(
      panel.getByRole('button', { name: 'Retry exact membership action', exact: true }),
    ).toBeVisible();
    await capture(page, 'private-consent-recovery-' + info.project.name);
    await panel.getByRole('button', { name: 'Retry exact membership action', exact: true }).click();
    await expect(panel.getByText('Your response: accepted', { exact: true })).toBeVisible();
    expect(wires).toHaveLength(3);
    expect(new Set(wires).size).toBe(1);
    const current = await (
      await page.request.get('/api/private/records?recordId=' + accepted.record.id)
    ).json();
    expect(current.records[0].version).toBe(accepted.record.version);
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  } finally {
    await world.close();
  }
});
test('a substituted ballot receipt freezes the original choice until exact recovery', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const world = await new Simulation().connect();
  try {
    const member = await world.persona('member'),
      other = await world.person(),
      labor = await world.persona('labor');
    const group = await world.association(
      member,
      other,
      labor,
      'Invented recovery association ' + randomUUID(),
    );
    const resolution = await world.resolution(
      member,
      group.association,
      'Invented recoverable ballot ' + randomUUID(),
    );
    await login(page, 'member');
    await page.getByRole('link', { name: 'My records', exact: true }).click();
    // Suite fixtures can put this resolution beyond the first record page.
    // Use the same authenticated reference lookup available to a member.
    await page.getByText('Open a record by reference', { exact: true }).click();
    await page.getByLabel('Record reference', { exact: true }).fill(resolution.id);
    await page.getByRole('button', { name: 'Open reference', exact: true }).click();
    await expect(page.getByRole('heading', { name: resolution.title, exact: true })).toBeVisible();
    const panel = page.locator('.member-ballot');
    const wires: string[] = [];
    let accepted: any;
    await page.route('**/api/private/commands', async (route) => {
      if (route.request().postDataJSON().recordId !== resolution.id) return route.continue();
      wires.push(route.request().postData()!);
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      if (wires.length === 1) {
        accepted = await response.json();
        return route.fulfill({
          response,
          json: { ...accepted, receipt: { ...accepted.receipt, recordId: randomUUID() } },
        });
      }
      return route.fulfill({ response });
    });
    await panel.getByLabel('Your vote', { exact: true }).selectOption('yes');
    await panel.getByRole('button', { name: 'Save my ballot', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('membership outcome is unknown');
    await expect(panel.getByLabel('Your vote', { exact: true })).toBeDisabled();
    await capture(page, 'private-ballot-recovery-' + info.project.name);
    await panel.getByRole('button', { name: 'Retry exact membership action', exact: true }).click();
    await expect(panel.getByText('Your saved ballot: yes', { exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Save my ballot', exact: true })).toHaveCount(0);
    expect(new Set(wires).size).toBe(1);
    expect(wires).toHaveLength(2);
    expect((await world.get(member, resolution.id))!.version).toBe(accepted.record.version);
    expect(
      (
        await world.owner.query('SELECT count(*)::int AS n FROM ballots WHERE resolution_id=$1', [
          resolution.id,
        ])
      ).rows[0].n,
    ).toBe(1);
  } finally {
    await world.close();
  }
});
