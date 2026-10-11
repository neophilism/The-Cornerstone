import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function login(page: Page, persona: 'participant' | 'labor') {
  await page.goto(persona === 'labor' ? 'http://127.0.0.1:3002' : 'http://127.0.0.1:3001');
  if (await page.getByRole('button', { name: 'Sign out', exact: true }).count()) {
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  }
  await page
    .getByRole('button', { name: `${persona} · synthetic development`, exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Your next step, made clear.' })).toBeVisible();
}
async function start(page: Page, name: string) {
  await page
    .locator('.workflow-card')
    .filter({ has: page.getByRole('heading', { name, exact: true }) })
    .getByRole('button', { name: 'Start draft' })
    .click();
}
async function open(page: Page, title: string) {
  await page.getByLabel('Find a record', { exact: true }).fill(title);
  await page
    .locator('.task-card')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    .getByRole('button', { name: 'Open', exact: true })
    .click();
}
async function attach(page: Page) {
  const panel = page.locator('.evidence-panel');
  await panel.getByText('Attach a synthetic text file', { exact: true }).click();
  await panel.getByLabel('Synthetic text file', { exact: true }).setInputFiles({
    name: 'invented-account.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('An entirely invented government action and primary livelihood loss.'),
  });
  await panel
    .getByLabel('What this item shows')
    .fill('Invented source supporting the stated facts');
  await panel
    .getByLabel('I am using invented development information only.', { exact: true })
    .check();
  await panel.getByRole('button', { name: 'Save quarantined attachment', exact: true }).click();
  await expect(
    panel.getByText('Quarantined · download unavailable', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.evidence-choice').getByRole('checkbox')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Validate synthetic text', exact: true }).click();
  await expect(panel.getByText('Synthetic text checked', { exact: true })).toBeVisible();
  await expect(
    page.locator('.evidence-choice').getByRole('checkbox', { name: /invented-account.txt/ }),
  ).toBeChecked();
}
async function shot(page: Page, path: string) {
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
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });
  await page.screenshot({ path, fullPage: true });
}
test('a person submits evidence by name, receives event review and pursues a separate individual claim', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const title = 'Invented guided event ' + info.project.name;
  await login(page, 'participant');
  await start(page, 'Event petition');
  await expect(
    page.getByRole('heading', { name: 'Explain the government action', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Record title').fill(title);
  await page.getByLabel('Action date', { exact: true }).fill('2000-01-01');
  await page
    .getByLabel('Implemented government action', { exact: true })
    .fill('Invented implemented action deliberately contracting an industry.');
  await page.getByLabel('Lawful industry', { exact: true }).fill('Invented lawful trade');
  await page
    .getByLabel('Evidence of the deliberate objective', { exact: true })
    .fill('Invented express objective stated in a government record');
  await page
    .getByLabel('Contrary evidence and other causes', { exact: true })
    .fill('Invented alternative market causes considered separately');
  await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
  await attach(page);
  const submit = page
    .locator('form')
    .filter({ has: page.getByRole('heading', { name: 'Submit for review', exact: true }) });
  const choice = submit.getByRole('checkbox', { name: /invented-account.txt/ });
  await choice.uncheck();
  await submit.getByLabel('I confirm this submission is complete and accurate').check();
  await submit.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(
    page.locator('.error-panel').filter({ hasText: 'Attach and validate evidence' }),
  ).toBeVisible();
  await choice.check();
  await submit.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Submitted for assigned review', exact: true }),
  ).toBeVisible();
  await page.reload();
  await open(page, title);
  await expect(
    page.getByRole('heading', { name: 'Submitted for assigned review', exact: true }),
  ).toBeVisible();
  await shot(page, `test-results/private-guided-submission-${info.project.name}.png`);
  await login(page, 'labor');
  await open(page, title);
  const old = new Date();
  old.setUTCDate(old.getUTCDate() - 61);
  await page.getByLabel('Valid notice date', { exact: true }).fill(old.toISOString().slice(0, 10));
  await page
    .getByLabel('Public docket reference', { exact: true })
    .fill('Invented public docket for simulation');
  await page.getByRole('button', { name: 'Open public evidentiary record', exact: true }).click();
  await page.getByRole('button', { name: 'Close evidentiary period', exact: true }).click();
  const finding = page.locator('form').filter({
    has: page.getByRole('heading', { name: 'Issue certified event finding', exact: true }),
  });
  for (const text of [
    'Government action was implemented',
    'The industry was lawful',
    'Destruction or material contraction was an objective or intended means',
    'An identifiable group suffered material direct harm',
  ])
    await finding.getByLabel(text + ' (required finding)', { exact: true }).check();
  await finding
    .getByLabel('First proven attributable loss date', { exact: true })
    .fill('2000-02-01');
  await finding
    .getByLabel('Written reasons', { exact: true })
    .fill(
      'Invented written findings consider the supplied evidence and contrary evidence. Administrative review is available; no legal determination is made in simulation.',
    );
  await expect(finding.getByRole('checkbox', { name: /invented-account.txt/ })).toBeChecked();
  await shot(page, `test-results/private-guided-review-${info.project.name}.png`);
  await finding.getByRole('button', { name: 'Issue certified event finding', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Event finding recorded in simulation', exact: true }),
  ).toBeVisible();
  await login(page, 'participant');
  await start(page, 'Individual eligibility');
  await page.getByLabel('Record title').fill('Invented guided claim ' + info.project.name);
  await page
    .getByLabel('Certified event', { exact: true })
    .selectOption({ label: title + ' · certified' });
  await page.getByLabel('Livelihood role', { exact: true }).selectOption('employee');
  await page.getByLabel('Share of your earned income (%) (optional)', { exact: true }).fill('75');
  await page
    .getByLabel('Direct material injury', { exact: true })
    .fill('Invented principal job destroyed; part-time work retained.');
  await page.getByLabel('Attributable loss date', { exact: true }).fill('2000-02-01');
  await shot(page, `test-results/private-guided-claim-${info.project.name}.png`);
  await page.getByRole('button', { name: 'Save synthetic draft', exact: true }).click();
  await expect(
    page.getByText('75% of earned income before the action', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await expect(
    page.getByLabel('Share of your earned income (%) (optional)', { exact: true }),
  ).toHaveValue('75');
  await page.getByRole('button', { name: 'Cancel editing', exact: true }).click();
  await attach(page);
  await page.getByLabel('I confirm this submission is complete and accurate').check();
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Submitted for assigned review', exact: true }),
  ).toBeVisible();
  await login(page, 'labor');
  await open(page, 'Invented guided claim ' + info.project.name);
  await page.getByRole('button', { name: 'Begin assigned review', exact: true }).click();
  const eligibility = page
    .locator('form')
    .filter({ has: page.getByRole('heading', { name: 'Issue eligible finding', exact: true }) });
  await eligibility
    .getByLabel('Material direct injury is proven (required finding)', { exact: true })
    .check();
  await eligibility
    .getByLabel('Written reasons', { exact: true })
    .fill(
      'Invented reliable account of the direct loss of a principal livelihood, contrary evidence considered, and administrative review route stated. Retained work does not erase the finding.',
    );
  await expect(eligibility.getByRole('checkbox', { name: /invented-account.txt/ })).toBeChecked();
  await eligibility.getByRole('button', { name: 'Issue eligible finding', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Individual finding recorded in simulation', exact: true }),
  ).toBeVisible();
  await login(page, 'participant');
  await open(page, 'Invented guided claim ' + info.project.name);
  await expect(
    page.getByRole('heading', { name: 'Individual finding recorded in simulation', exact: true }),
  ).toBeVisible();
});
