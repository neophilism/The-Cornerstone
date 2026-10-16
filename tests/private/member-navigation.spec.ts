import { test, expect } from '@playwright/test';
test('an invitation outside the loaded record page still opens through current access checks', async ({
  page,
}) => {
  await page.route('**/api/private/records?limit=50', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    if (response.ok()) {
      const omitted = body.records
        .filter((r: { title: string }) => r.title === 'Invented voluntary invitation')
        .map((r: { id: string }) => r.id);
      body.records = body.records.filter((r: { id: string }) => !omitted.includes(r.id));
      body.capabilities = body.capabilities.filter(
        (c: { recordId: string }) => !omitted.includes(c.recordId),
      );
    }
    await route.fulfill({ response, json: body });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'member · synthetic development', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your next step, made clear.' })).toBeVisible();
  await page.getByRole('link', { name: 'Membership & votes', exact: true }).click();
  const invitation = page.locator('.invitation-card').filter({
    has: page.getByRole('heading', { name: 'Invented voluntary invitation', exact: true }),
  });
  await expect(invitation).toHaveCount(1);
  await expect(
    invitation.getByRole('button', { name: 'Review association', exact: true }),
  ).toBeEnabled();
  await invitation.getByRole('button', { name: 'Review association', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Invented voluntary invitation', exact: true }),
  ).toBeVisible();
});

test('denied association lookups do not restore cached membership titles', async ({ page }) => {
  await page.route('**/api/private/records?recordId=*', (route) =>
    route.fulfill({ status: 403, json: { message: 'Synthetic association access denied' } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'member · synthetic development', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your next step, made clear.' })).toBeVisible();
  await page.getByRole('link', { name: 'Membership & votes', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Refresh memberships', exact: true }),
  ).toBeEnabled();
  await expect(
    page
      .locator('.invitation-card')
      .getByRole('heading', { name: 'Invented voluntary invitation', exact: true }),
  ).toHaveCount(0);
  const invitation = page
    .locator('.invitation-card')
    .filter({ has: page.getByRole('heading', { name: 'Association invitation', exact: true }) })
    .first();
  await invitation.getByRole('button', { name: 'Review association', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Synthetic association access denied' }),
  ).toBeVisible();
});
