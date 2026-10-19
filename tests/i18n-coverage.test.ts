import { describe, expect, it } from 'vitest';
import { dictionary, translate, translationCoverage } from '../packages/i18n/src/index.js';

describe('CS-23 locale coverage and runtime guards', () => {
  it('rejects unsupported locales without prototype lookup', () => {
    expect(() => translate('__proto__' as never)).toThrow(/Unsupported locale/);
    expect(() => translate('fr' as never)).toThrow(/Unsupported locale/);
  });

  it('reports structural dictionary parity without claiming human review', () => {
    const result = translationCoverage();
    expect(result).toHaveLength(2);
    expect(result.map((row) => row.locale)).toEqual(['en', 'es']);
    expect(result.every((row) => row.structureComplete)).toBe(true);
    expect(result.every((row) => row.humanReviewed === false)).toBe(true);
    expect(result.every((row) => row.missing.length === 0)).toBe(true);
    expect(result.every((row) => row.extra.length === 0)).toBe(true);
    expect(translate('es').privacy).toBe(dictionary.es.privacy);
  });
});
