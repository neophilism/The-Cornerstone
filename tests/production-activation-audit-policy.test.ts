import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL('../' + relative, import.meta.url), 'utf8');

describe('protected program activation owner policy', () => {
  it('does not identify independent security auditing as a technical activation prerequisite', () => {
    const source = read('apps/api/src/main.ts');
    expect(source).not.toContain('IDENTITY_REVIEW_REQUIRED');
    expect(source).not.toContain('awaiting independent review');
    expect(source).toContain('PROGRAM_ACTIVATION_NOT_AUTHORIZED');
    expect(source).toContain('lawful program activation and verified identity/recovery controls');
    expect(source).toMatch(/if \(production\)[\s\S]{0,90}PROGRAM_ACTIVATION_NOT_AUTHORIZED/);
  });
  it('keeps legal activation, approved identity and real technical safeguards explicit in public copy', () => {
    const content = [
      read('packages/ui/src/workspace.tsx'),
      read('apps/web/app/workspace/preview.tsx'),
      read('apps/web/app/privacy/page.tsx'),
      read('apps/web/app/policy/page.tsx'),
    ].join('\n');
    expect(content).toContain('legal activation');
    expect(content).toContain('verified security');
    expect(content).toContain('not an activation prerequisite');
    expect(content).not.toContain('independent security review and legal activation');
  });
});
