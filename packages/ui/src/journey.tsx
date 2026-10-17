import { ReminderPanel } from './reminder.js';
import type { CaseRecord } from '@cornerstone/contracts';
import { actionUnavailable, workflow } from '@cornerstone/domain';
const preparation: Record<string, [string, string]> = {
  opportunity: [
    'Prepare first; share only with your members',
    'Explore feasibility privately. A current founder can then share a fixed plan, with accessible training, enterprise financing and ordinary legal prerequisites, for an optional all-unit-majority planning vote. Planning never authorizes operations or compels individual participation.',
  ],
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
  deceased_filing: [
    'Prepare one claim for the original worker',
    'Explain the death, identity and succession chain with invented evidence. Assigned standing review comes first; the worker’s own livelihood and injury still need a separate eligibility claim. Never sign in as the worker.',
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
  const transitions = workflow(record.kind).actions.filter((action) =>
    action.from.includes(record.state),
  );
  const blocked =
    transitions.length > 0 &&
    transitions.every((action) => actionUnavailable(record.kind, action.key) !== null);
  const copy: Record<string, [string, string]> = {
    draft: [
      'Review your draft',
      'Review your saved details and supporting material. Saving a draft does not submit it. Actions permitted for your current role and this record version appear below.',
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
  const message = blocked
    ? [
        record.state === 'draft'
          ? 'Prepare a draft; submission is unavailable'
          : 'A required integration is unavailable',
        'Read the prerequisites below. Preparing or exporting this record does not complete an unavailable action. The service will reject that action without changing the record.',
      ]
    : record.kind === 'event_petition' && record.state === 'certified'
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
  return (
    <>
      {message && (
        <aside className="journey-guide">
          <p className="eyebrow">Your next step</p>
          <h2>{message[0]}</h2>
          <p>{message[1]}</p>
        </aside>
      )}
      <ReminderPanel key={record.id} recordId={record.id} />
    </>
  );
}
