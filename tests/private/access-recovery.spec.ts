import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { Simulation } from '../helpers/simulation.js';

async function open(page: Page, id: string) {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'participant · synthetic development', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your next step, made clear.', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'My records', exact: true }).click();
  await page.getByText('Open a record by reference', { exact: true }).click();
  await page.getByLabel('Record reference', { exact: true }).fill(id);
  await page.getByRole('button', { name: 'Open reference', exact: true }).click();
  await page.getByText('Help with this record', { exact: true }).click();
}
async function capture(page: Page, name: string) {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/' + name + '.png', fullPage: true });
}
for (const revoke of [false, true])
  test(
    (revoke ? 'revocation' : 'grant') +
      ' retains one exact request after lost or substituted receipts and denied retries',
    async ({ page }, info) => {
      const world = await new Simulation().connect();
      try {
        const owner = await world.persona('participant'),
          delegate = await world.person();
        const record = await world.create(
          owner,
          'dossier',
          'Invented access recovery ' + randomUUID(),
          {
            actionDescription: 'Invented recovery action',
            livelihood: 'Invented livelihood',
            lossDescription: 'Invented loss',
          },
        );
        await open(page, record.id);
        const panel = page.locator('.access-panel');
        await panel.getByLabel('Recipient workspace ID', { exact: true }).fill(delegate.id);
        await panel
          .getByLabel('Access expiration date', { exact: true })
          .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
        await panel
          .getByLabel('Allow draft edits and synthetic attachments', { exact: true })
          .check();
        await panel
          .getByLabel('I authorize this person to read this record, its versions and receipts.', {
            exact: true,
          })
          .check();
        if (revoke) {
          await panel.getByRole('button', { name: 'Give draft access', exact: true }).click();
          await expect(
            panel.getByRole('button', { name: 'Revoke access', exact: true }),
          ).toBeVisible();
        }
        const wires: string[] = [];
        let accepted: any;
        const path = revoke ? 'revoke' : 'grant';
        await page.route('**/api/private/access/' + path, async (route) => {
          wires.push(route.request().postData()!);
          if (wires.length === 2)
            return route.fulfill({ status: 403, json: { message: 'Invented denied retry' } });
          const response = await route.fetch();
          expect(response.ok()).toBe(true);
          if (wires.length === 1) {
            accepted = await response.json();
            if (!revoke) return route.abort('failed');
            return route.fulfill({
              response,
              json: { ...accepted, receipt: { ...accepted.receipt, recordId: randomUUID() } },
            });
          }
          return route.fulfill({ response });
        });
        await panel
          .getByRole('button', {
            name: revoke ? 'Revoke access' : 'Give draft access',
            exact: true,
          })
          .click();
        const retry = panel.getByRole('button', { name: 'Retry exact access change', exact: true });
        await expect(retry).toBeVisible();
        await expect(panel.getByLabel('Recipient workspace ID', { exact: true })).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Edit draft', exact: true })).toBeDisabled();
        await retry.click();
        await expect(retry).toBeEnabled();
        await page.getByRole('link', { name: 'Overview', exact: true }).click();
        await expect(retry).toBeVisible();
        await capture(page, 'private-access-' + path + '-recovery-' + info.project.name);
        let release!: () => void, observed!: () => void;
        const held = new Promise<void>((resolve) => (release = resolve)),
          refreshing = new Promise<void>((resolve) => (observed = resolve));
        await page.route('**/api/private/records?recordId=' + record.id, async (route) => {
          const response = await route.fetch();
          expect(response.ok()).toBe(true);
          observed();
          await held;
          await route.fulfill({ response });
        });
        await retry.click();
        await refreshing;
        try {
          // Disclosure state survives the refresh, but cached private controls do not.
          await expect(page.locator('.record-view')).toHaveCount(0);
          await expect(panel).toHaveCount(0);
        } finally {
          release();
        }
        await expect(retry).toHaveCount(0);
        await expect(
          page.getByText('Simulation receipt · version ' + accepted.record.version, {
            exact: true,
          }),
        ).toBeVisible();
        const grants = await world.owner.query(
          'SELECT revoked_at FROM grants WHERE record_id=$1 AND subject_id=$2',
          [record.id, delegate.id],
        );
        expect(grants.rows).toHaveLength(1);
        expect(grants.rows[0].revoked_at !== null).toBe(revoke);
        expect((await world.get(owner, record.id))!.version).toBe(accepted.record.version);
        expect(wires).toHaveLength(3);
        expect(new Set(wires).size).toBe(1);
        if (revoke) await expect(panel.getByText(/Revoked/)).toBeVisible();
        else
          await expect(
            panel.getByRole('button', { name: 'Revoke access', exact: true }),
          ).toBeVisible();
        await expect(panel).toHaveAttribute('open', '');
        await expect(panel.getByLabel('Recipient workspace ID', { exact: true })).toHaveValue('');
        await expect(
          panel.getByLabel(
            'I authorize this person to read this record, its versions and receipts.',
            {
              exact: true,
            },
          ),
        ).not.toBeChecked();
        await expect(page.getByRole('button', { name: 'Edit draft', exact: true })).toBeEnabled();
        if (!revoke) {
          const another = await world.create(
            owner,
            'dossier',
            'Invented separate access record ' + randomUUID(),
            {
              actionDescription: 'Invented separate action',
              livelihood: 'Invented separate livelihood',
              lossDescription: 'Invented separate loss',
            },
          );
          await page.getByRole('link', { name: 'My records', exact: true }).click();
          await page.getByText('Open a record by reference', { exact: true }).click();
          await page.getByLabel('Record reference', { exact: true }).fill(another.id);
          const loaded = page.waitForResponse(
            (response) =>
              response.url().endsWith('/api/private/access?recordId=' + another.id) &&
              response.request().method() === 'GET',
          );
          await page.getByRole('button', { name: 'Open reference', exact: true }).click();
          expect((await loaded).ok()).toBe(true);
          await expect(panel).not.toHaveAttribute('open', '');
          await page.getByText('Help with this record', { exact: true }).click();
          await expect(panel.getByText('No draft-access grants.', { exact: true })).toBeVisible();
          await expect(panel.locator('.workspace-id')).toHaveCount(0);
        }
        expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
      } finally {
        await world.close();
      }
    },
  );
