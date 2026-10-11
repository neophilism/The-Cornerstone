import { setTimeout } from 'node:timers/promises';
const origin = 'https://cornerstone-policy-preview.onrender.com';
const expected = process.env['EXPECTED_PREVIEW_COMMIT'];
if (!expected || !/^[a-f0-9]{40}$/.test(expected))
  throw Error('An exact preview commit is required.');
const deadline = Date.now() + 240000;
let last = 'The preview is not ready.';
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${origin}/api/healthz`, {
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    const health = await response.json();
    if (
      !response.ok ||
      health.status !== 'ok' ||
      health.mode !== 'proposal' ||
      health.protectedIntake !== false
    )
      throw Error('The preview health or mode does not match the public-only release.');
    if (health.commit !== expected)
      throw Error('Render has not deployed the exact checked preview commit.');
    const home = await fetch(origin, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    if (
      !home.ok ||
      !(home.headers.get('Content-Security-Policy') || '').includes("'strict-dynamic'")
    )
      throw Error('The public homepage or content security policy is unavailable.');
    if (!(await home.text()).includes('When policy takes'))
      throw Error('The expected public homepage was not returned.');
    console.log(
      `PASS: Render returned the public homepage and healthy proposal-only API for ${expected}.`,
    );
    process.exit(0);
  } catch (error) {
    last = error instanceof Error ? error.message : 'Preview verification failed.';
  }
  await setTimeout(5000);
}
throw Error(last);
