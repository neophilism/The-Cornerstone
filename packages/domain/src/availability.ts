import type { Kind } from '@cornerstone/contracts';

/** Release prerequisites, not permission grants or legal authority. */
export function actionUnavailable(
  kind: Kind,
  action: string,
): { code: string; message: string } | null {
  if (
    ['sealed_ranking', 'draw', 'round'].includes(kind) &&
    ['seal', 'replace', 'publish', 'open', 'close', 'compute'].includes(action)
  )
    return {
      code: 'CUSTODY_REVIEW_REQUIRED',
      message:
        'Independently reviewed ranking custody and witnessed draw providers are not installed.',
    };
  if (kind === 'match' && action === 'accept')
    return {
      code: 'EXCHANGE_RESULT_REQUIRED',
      message: 'A verified exchange result and unique active-match transaction are required.',
    };
  if (action === 'confirm_transfer' || (kind === 'land_acquisition' && action === 'settle'))
    return {
      code: 'TREASURY_ADAPTER_REQUIRED',
      message:
        'An independently confirmed Treasury or settlement integration is not installed. No payment receipt has been issued.',
    };
  if (kind === 'succession' && action === 'approve')
    return {
      code: 'SUCCESSION_REVIEW_REQUIRED',
      message:
        'The single-successor identity, grant and immutable unit transfer must be independently reviewed before activation.',
    };
  return null;
}
