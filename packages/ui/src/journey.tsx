import type { CaseRecord } from '@cornerstone/contracts';
const preparation: Record<string, [string, string]> = {
  offer: [
    'Publish complete terms before choice',
    'Identify the currently prohibited trade and district, existing rights protected, prospective Rate Act, common calculation and bounded commercial menu. A state offer cannot choose favored workers or displace an existing lawful market.',
  ],
  fund_commitment: [
    'A limited enterprise advance',
    'Itemize formation, feasibility, licensing and training costs. Members, successors and estates take on no personal debt or guarantee. The enterprise repays the advance and fixed public return under a predetermined formula, then that repayment ends.',
  ],
  financial_schedule: [
    'Protect necessary cash, then calculate the state share',
    'Reconcile receipts, legitimate costs, prior losses, required Fund payments and documented cash protections. The rate and method come from the published offer. No positive shareable surplus means no state payment; the state receives no corporate control.',
  ],
  event_petition: [
    'Explain the government action',
    'Describe the implemented action, the lawful industry and evidence that its destruction or material contraction was deliberate. Include contrary evidence. Unlisted and historical events may be considered with reliable proof.',
  ],
  claim: [
    'Explain your own livelihood and injury',
    'An event finding does not decide your claim. Describe your established livelihood and direct material loss. Retained part-time work, later employment and ordinary transition benefits do not by themselves erase eligibility.',
  ],
  association: [
    'Form together, before choosing opportunities',
    'Every proposed founder must personally accept unchanged terms. One vote, equal base rights and voluntary participation are protected. No one must relocate, retrain, work for the enterprise or take on personal debt.',
  ],
  hearing: [
    'Identify the decision you want reviewed',
    'Explain the grounds for review and any access needs. This workspace does not file a case in a court.',
  ],
};
export function PreparationGuide({ kind }: { kind: string }) {
  const copy = preparation[kind];
  if (!copy) return null;
  return (
    <aside className="journey-guide">
      <p className="eyebrow">Before you begin</p>
      <h2>{copy[0]}</h2>
      <p>{copy[1]}</p>
      <p className="hint">
        Save a draft, add supporting material, then submit when ready. Saving alone does not submit
        anything.
      </p>
    </aside>
  );
}
export function RecordNextStep({ record }: { record: CaseRecord }) {
  const copy: Record<string, [string, string]> = {
    draft: [
      'Prepare, then submit',
      'Review your saved details and add supporting material. You can return to a saved draft at any time. Available actions appear below.',
    ],
    submitted: [
      'Submitted for assigned review',
      'Your receipt records the submission. It is not approval. Return here or check Activity for updates.',
    ],
    record_open: [
      'The evidentiary period is open',
      'The assigned reviewer must preserve the required notice and evidence period before making written findings.',
    ],
    review: [
      'Assigned review is underway',
      'A decision requires the applicable findings and supporting evidence. Your record and attachments remain available for inspection.',
    ],
    denied: [
      'Read the reasons and review options',
      'Review the written reasons and supporting material. You can request administrative review using the action below if it is available to you. This does not file anything in court.',
    ],
    review_requested: [
      'Review requested',
      'The request and receipt are saved. Use Hearing and review to prepare a related review record. Scheduling and a written decision are separate steps.',
    ],
  };
  const message =
    record.kind === 'event_petition' && record.state === 'certified'
      ? [
          'Event finding recorded in simulation',
          'People still need separate individual eligibility findings. The census itself cannot establish eligibility.',
        ]
      : record.kind === 'claim' && record.state === 'eligible'
        ? [
            'Individual finding recorded in simulation',
            'You may voluntarily organize with other eligible people. Founding consent and a closed roll come before opportunity rankings.',
          ]
        : copy[record.state];
  if (!message) return null;
  return (
    <aside className="journey-guide">
      <p className="eyebrow">Your next step</p>
      <h2>{message[0]}</h2>
      <p>{message[1]}</p>
    </aside>
  );
}
