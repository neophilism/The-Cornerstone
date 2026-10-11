import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('a prospective founder can accept membership separately from approving larger scale', async ({
  page,
}, info) => {
  await page.goto('/');
  const persona = info.project.name === 'desktop' ? 'participant' : 'member';
  await page
    .getByRole('button', { name: `${persona} · synthetic development`, exact: true })
    .click();
  await page.getByRole('link', { name: 'Membership & votes', exact: true }).click();
  const invitation = page.locator('.invitation-card').filter({
    has: page.getByRole('heading', { name: 'Invented larger invitation', exact: true }),
  });
  await invitation.getByRole('button', { name: 'Review association', exact: true }).click();
  const consent = page.locator('.founding-consent');
  await consent.getByLabel(/^I voluntarily accept these unchanged terms/).check();
  await consent.getByRole('radio', { name: 'No, do not approve this scale', exact: true }).check();
  await consent.getByRole('button', { name: 'Accept founding invitation', exact: true }).click();
  await expect(consent.getByText('Your response: accepted', { exact: true })).toBeVisible();
  await expect(consent.getByText('Your recorded scale choice: no', { exact: true })).toBeVisible();
  await consent.getByLabel(/^I voluntarily accept these unchanged terms/).check();
  await consent.getByRole('radio', { name: 'Yes, approve this scale', exact: true }).check();
  await consent.getByRole('button', { name: 'Save scale choice', exact: true }).click();
  await expect(consent.getByText('Your recorded scale choice: yes', { exact: true })).toBeVisible();
  await consent.getByRole('button', { name: 'Withdraw founding consent', exact: true }).click();
  await expect(
    consent.getByText('Your recorded scale choice: abstain', { exact: true }),
  ).toBeVisible();
  await consent.getByLabel(/^I voluntarily accept these unchanged terms/).check();
  await consent.getByRole('radio', { name: 'Yes, approve this scale', exact: true }).check();
  await consent.getByRole('button', { name: 'Accept founding invitation', exact: true }).click();
  await expect(consent.getByText('Your recorded scale choice: yes', { exact: true })).toBeVisible();
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
  await page.screenshot({
    path: `test-results/private-larger-consent-${info.project.name}.png`,
    fullPage: true,
  });
  await page.reload();
  await page.getByRole('link', { name: 'Membership & votes', exact: true }).click();
  await invitation.getByRole('button', { name: 'Review association', exact: true }).click();
  await expect(consent.getByText('Your recorded scale choice: yes', { exact: true })).toBeVisible();
});
