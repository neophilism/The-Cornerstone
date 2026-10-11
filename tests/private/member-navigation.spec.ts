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
  const invitation = page
    .locator('.invitation-card')
    .filter({ has: page.getByRole('heading', { name: 'Association invitation', exact: true }) });
  await expect(invitation).toHaveCount(1);
  await invitation.getByRole('button', { name: 'Review association', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Invented voluntary invitation', exact: true }),
  ).toBeVisible();
});
