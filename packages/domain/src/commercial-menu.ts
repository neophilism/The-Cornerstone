import { CommercialMenuSchema, CommercialTermsSchema } from '@cornerstone/contracts';
import { DomainError } from './errors.js';

/** Every published key must be selected exactly once, with no implicit or negotiated defaults. */
export function validateCommercialTerms(menuInput: unknown, termsInput: unknown) {
  const menu = CommercialMenuSchema.parse(menuInput);
  const terms = CommercialTermsSchema.parse(termsInput);
  const keys = Object.keys(menu).sort();
  if (JSON.stringify(keys) !== JSON.stringify(Object.keys(terms).sort()))
    throw new DomainError(
      'INCOMPLETE_MENU',
      'Select exactly one choice for every published commercial term; do not add terms.',
    );
  for (const key of keys)
    if (!menu[key]!.some((choice) => choice === terms[key]))
      throw new DomainError(
        'OUTSIDE_MENU',
        'A selected term is outside the immutable published menu.',
      );
  return terms;
}
