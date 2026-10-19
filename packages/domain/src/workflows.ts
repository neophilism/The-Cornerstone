import type { CaseRecord, Kind, Role } from '@cornerstone/contracts';
import {
  DateSchema,
  MoneySchema,
  IdSchema,
  FoundingUnitsSchema,
  FundBudgetSchema,
  FractionSchema,
  InvestorRightsSchema,
  StateTermsSchema,
  SurplusPreparationSchema,
  CommercialMenuSchema,
  CommercialTermsSchema,
} from '@cornerstone/contracts';
import {
  type Field,
  type ActionDefinition,
  type WorkflowDefinition,
  DomainError,
  requireCondition,
  principalLivelihood,
  majorityOfAll,
  validateCapitalRights,
  addCalendarDays,
} from './index.js';

const f = (
  key: string,
  label: string,
  type: Field['type'] = 'text',
  required = true,
  help?: string,
  options?: string[],
): Field => ({
  key,
  label,
  type,
  required,
  ...(help ? { help } : {}),
  ...(options ? { options } : {}),
});
const participant: Role[] = ['participant', 'representative', 'member'];
const reasons = f(
  'reasons',
  'Written reasons',
  'textarea',
  true,
  'Explain the evidence, contrary evidence, findings, and review route.',
);
const evidence = f(
  'evidenceIds',
  'Evidence record IDs',
  'json',
  true,
  'An array of record IDs. Use synthetic records in the development environment.',
);
const individualClaimFields = [
  f('eventId', 'Certified event record ID'),
  f('workerType', 'Livelihood role', 'select', true, undefined, [
    'employee',
    'independent_worker',
    'owner_operator',
    'direct_supplier',
  ]),
  f('earnedIncomeShare', 'Pre-action earned-income share (0 to 1)', 'number', false),
  f('annualHours', 'Pre-action annual hours', 'number', false),
  f('injuryDescription', 'Direct material injury', 'textarea'),
  f('lossDate', 'Attributable loss date', 'date'),
  evidence,
];
const reference = f('referenceId', 'Related record ID');
const consent = f('attested', 'I confirm this submission is complete and accurate', 'boolean');
const financialNotice = [
  f(
    'noticeDate',
    'Synthetic calculation notice date',
    'date',
    true,
    'This date starts only the synthetic 60-day appeal window; it does not establish real service.',
  ),
  f('noticeReference', 'Synthetic calculation notice reference'),
];
const action = (
  key: string,
  label: string,
  from: string[],
  to: string,
  roles: Role[],
  authority: string | null,
  fields: Field[],
  help: string,
): ActionDefinition => ({ key, label, from, to, roles, authority, fields, help });
const submit = (from = ['draft']): ActionDefinition =>
  action(
    'submit',
    'Submit for review',
    from,
    'submitted',
    participant,
    null,
    [consent],
    'Submission is a receipt, not a determination.',
  );
const review = (role: Role, authority: string): ActionDefinition =>
  action(
    'begin_review',
    'Begin assigned review',
    ['submitted'],
    'review',
    [role],
    authority,
    [],
    'Only an assigned reviewer without a conflict may act.',
  );
const deny = (role: Role, authority: string, from = ['review']): ActionDefinition =>
  action(
    'deny',
    'Issue an adverse finding',
    from,
    'denied',
    [role],
    authority,
    [reasons, evidence],
    'Issue written reasons and a valid review route.',
  );
const appeal = (from = ['denied']): ActionDefinition =>
  action(
    'request_review',
    'Request review',
    from,
    'review_requested',
    participant,
    null,
    [reasons],
    'This requests administrative review. It does not file anything in a court.',
  );
const w = (
  kind: Kind,
  label: string,
  description: string,
  createRoles: Role[],
  createFields: Field[],
  actions: ActionDefinition[],
  official = true,
  initial = 'draft',
): WorkflowDefinition => ({
  kind,
  label,
  description,
  initial,
  createRoles,
  createFields: createFields.map((field) =>
    field.key === 'evidenceIds'
      ? {
          ...field,
          required: false,
          help: 'Save a draft, then attach and validate synthetic text. Evidence IDs are required before submission or findings.',
        }
      : field,
  ),
  actions: actions.map((a) =>
    a.key === 'submit' && createFields.some((field) => field.key === 'evidenceIds')
      ? { ...a, fields: [{ ...evidence, required: false }, ...a.fields] }
      : a,
  ),
  official,
});

export const workflows: WorkflowDefinition[] = [
  w(
    'dossier',
    'Preparation dossier',
    'Organize what you know without claiming official status.',
    participant,
    [
      f('actionDescription', 'Government action', 'textarea'),
      f('livelihood', 'Established livelihood', 'textarea'),
      f('lossDescription', 'Direct loss', 'textarea'),
    ],
    [
      action(
        'mark_ready',
        'Mark preparation complete',
        ['draft'],
        'ready',
        participant,
        null,
        [],
        'Preparation only; no application or finding.',
      ),
      action(
        'reopen',
        'Continue preparing',
        ['ready'],
        'draft',
        participant,
        null,
        [],
        'Keep preparing your record.',
      ),
    ],
    false,
  ),
  w(
    'organizing_group',
    'Organizing group',
    'Explore voluntary formation before certified membership.',
    participant,
    [f('purpose', 'Group purpose', 'textarea'), f('eventReference', 'Event or action reference')],
    [
      action(
        'open',
        'Open organizing',
        ['draft'],
        'organizing',
        participant,
        null,
        [consent],
        'No eligibility or founding unit is created.',
      ),
      action(
        'close',
        'Close organizing',
        ['organizing'],
        'closed',
        participant,
        null,
        [reasons],
        'Association certification is a separate procedure.',
      ),
    ],
    false,
  ),
  w(
    'event_petition',
    'Event petition',
    'Request a finding about a deliberate government industry-contraction action.',
    participant,
    [
      f('actionDate', 'Action date', 'date'),
      f('actionText', 'Implemented government action', 'textarea'),
      f('industry', 'Lawful industry'),
      f('objectiveEvidence', 'Evidence of the deliberate objective', 'textarea'),
      f('contraryEvidence', 'Contrary evidence and other causes', 'textarea'),
      evidence,
    ],
    [
      submit(),
      action(
        'open_record',
        'Open public evidentiary record',
        ['submitted'],
        'record_open',
        ['labor'],
        'event',
        [
          f('noticeDate', 'Valid notice date', 'date'),
          f('publicDocket', 'Public docket reference'),
        ],
        'Public evidence must remain open for the required period.',
      ),
      action(
        'close_record',
        'Close evidentiary period',
        ['record_open'],
        'review',
        ['labor'],
        'event',
        [],
        'At least 60 days after valid notice.',
      ),
      action(
        'certify',
        'Issue certified event finding',
        ['review'],
        'certified',
        ['labor'],
        'event',
        [
          f('implemented', 'Government action was implemented', 'boolean'),
          f('lawfulIndustry', 'The industry was lawful', 'boolean'),
          f(
            'deliberateObjective',
            'Destruction or material contraction was an objective or intended means',
            'boolean',
          ),
          f(
            'materialDirectGroup',
            'An identifiable group suffered material direct harm',
            'boolean',
          ),
          f('firstLossDate', 'First proven attributable loss date', 'date'),
          reasons,
          evidence,
        ],
        'A census entry never supplies this finding.',
      ),
      deny('labor', 'event'),
      appeal(),
    ],
  ),
  w(
    'claim',
    'Individual eligibility',
    'Request a separate established-livelihood and direct-injury finding.',
    participant,
    individualClaimFields,
    [
      submit(),
      review('labor', 'claim'),
      action(
        'find_eligible',
        'Issue eligible finding',
        ['review'],
        'eligible',
        ['labor'],
        'claim',
        [
          f('directInjuryProven', 'Material direct injury is proven', 'boolean'),
          f(
            'supplierDirectDependence',
            'If a supplier, the qualifying direct dependence is proven',
            'boolean',
            false,
          ),
          reasons,
          evidence,
        ],
        'Later work and ordinary transition benefits do not erase proven eligibility.',
      ),
      deny('labor', 'claim'),
      appeal(),
      action(
        'return_unremedied',
        'Return claim after qualifying government defeat',
        ['eligible', 'remedied'],
        'eligible',
        ['labor'],
        'claim',
        [
          f('governmentDefeat', 'Government defeated the opportunity', 'boolean'),
          f('ownMaterialBreach', 'Claimant caused a material breach', 'boolean'),
          reasons,
        ],
        'Ordinary market failure does not automatically reopen a remedied claim.',
      ),
    ],
  ),
  w(
    'hearing',
    'Hearing and review',
    'Request accessible administrative review of a specified decision.',
    participant,
    [
      reference,
      f('grounds', 'Grounds for review', 'textarea'),
      f('accommodation', 'Accommodation or assisted route', 'textarea', false),
    ],
    [
      submit(),
      action(
        'schedule',
        'Schedule hearing',
        ['submitted'],
        'scheduled',
        ['adjudicator'],
        'review',
        [f('hearingDate', 'Hearing date', 'date'), f('noticeReference', 'Valid hearing notice')],
        'Use valid notice and an impartial adjudicator.',
      ),
      action(
        'record_hearing',
        'Record hearing',
        ['scheduled'],
        'heard',
        ['adjudicator'],
        'review',
        [f('hearingRecord', 'Hearing record reference')],
        'Preserve both sides’ evidence.',
      ),
      action(
        'decide',
        'Issue review decision',
        ['heard'],
        'decided',
        ['adjudicator'],
        'review',
        [
          f('disposition', 'Disposition', 'select', true, undefined, [
            'affirm',
            'reverse',
            'remand',
          ]),
          reasons,
          evidence,
        ],
        'The written decision must state the available judicial review route.',
      ),
    ],
  ),
  w(
    'succession',
    'Single-successor request',
    'Request one existing founding unit after a death, without another vote or account access.',
    ['participant', 'member'],
    [
      f(
        'unitId',
        'Existing founding unit reference',
        'text',
        true,
        'Use a supplied unit reference. It does not grant access to the former holder or their private claim.',
      ),
      f('transferBasis', 'Succession route', 'select', true, undefined, [
        'member_death',
        'estate_designation',
      ]),
      f('capacity', 'Requested capacity', 'select', true, undefined, [
        'designated_successor',
        'estate_representative',
      ]),
      f('chain', 'Succession evidence and chain', 'textarea'),
      evidence,
    ],
    [
      action(
        'submit',
        'Submit my succession request',
        ['draft'],
        'submitted',
        ['participant', 'member'],
        null,
        [
          consent,
          f(
            'rightsAcknowledged',
            'I request one undivided unit, with no extra vote, personal debt or access to a different private account',
            'boolean',
          ),
        ],
        'Only the proposed successor can personally submit. Invented development evidence is not legal proof.',
      ),
      review('labor', 'claim'),
      action(
        'request_changes',
        'Request a corrected succession packet',
        ['review'],
        'changes_requested',
        ['labor'],
        'claim',
        [reasons],
        'Explain needed evidence or a changed holder. No unit is changed.',
      ),
      action(
        'revise_request',
        'Reopen my draft',
        ['changes_requested'],
        'draft',
        ['participant', 'member'],
        null,
        [],
        'Review and resubmit personally. The next review takes a fresh unit-holder snapshot.',
      ),
      action(
        'approve',
        'Approve one synthetic successor',
        ['review'],
        'approved',
        ['labor'],
        'claim',
        [
          f('undivided', 'Exactly one undivided founding unit is preserved', 'boolean'),
          f(
            'deathEstablished',
            'The death of the relevant rights holder is supported by the evidence',
            'boolean',
          ),
          f('identityEstablished', 'The proposed successor is the requesting person', 'boolean'),
          f(
            'chainEstablished',
            'The designation or estate authority and chain are established',
            'boolean',
          ),
          f(
            'probateConsistent',
            'The route follows uniform bylaws and the applicable probate requirements',
            'boolean',
          ),
          f(
            'competingRightsResolved',
            'Notice, review and any competing claims have been addressed',
            'boolean',
          ),
          f('legalBasis', 'Bylaw, probate, notice and review basis', 'textarea'),
          reasons,
          evidence,
        ],
        'Transfer the existing unit atomically in simulation. This does not prove real identity, effect legal succession, divide rights, reveal prior ballots or transfer an account.',
      ),
      deny('labor', 'claim'),
      appeal(),
    ],
  ),
  w(
    'claim_survival',
    'Surviving claim request',
    'Request authority to prove or exercise one existing claim before enrollment.',
    ['participant', 'member'],
    [
      f(
        'claimId',
        'Original claim reference',
        'text',
        true,
        'A supplied reference does not reveal the file. An assigned reviewer must verify the chain before any case-specific access changes.',
      ),
      f('transferBasis', 'Claim succession route', 'select', true, undefined, [
        'holder_death',
        'estate_designation',
      ]),
      f('capacity', 'Requested claim capacity', 'select', true, undefined, [
        'designated_successor',
        'estate_representative',
      ]),
      f('chain', 'Death, designation and succession chain', 'textarea'),
      evidence,
    ],
    [
      action(
        'submit',
        'Submit my surviving claim request',
        ['draft'],
        'submitted',
        ['participant', 'member'],
        null,
        [
          consent,
          f(
            'rightsAcknowledged',
            "I request one undivided claim and only the case access needed to exercise it, not another person's account or an extra unit",
            'boolean',
          ),
        ],
        "The proposed successor must submit personally. This is not proof of the original worker's eligibility.",
      ),
      review('labor', 'claim'),
      action(
        'request_changes',
        'Request a corrected claim-survival packet',
        ['review'],
        'changes_requested',
        ['labor'],
        'claim',
        [reasons],
        'Explain missing evidence or a changed claim. No claim control changes.',
      ),
      action(
        'revise_request',
        'Reopen my claim-survival draft',
        ['changes_requested'],
        'draft',
        ['participant', 'member'],
        null,
        [],
        'Correct and resubmit personally. A new review will capture the current claim version.',
      ),
      action(
        'approve',
        'Approve case-specific claim survival',
        ['review'],
        'approved',
        ['labor'],
        'claim',
        [
          f('undivided', 'Exactly one existing undivided claim is preserved', 'boolean'),
          f(
            'deathEstablished',
            'The death of the relevant rights holder is supported by the evidence',
            'boolean',
          ),
          f('identityEstablished', 'The proposed successor is the requesting person', 'boolean'),
          f(
            'chainEstablished',
            'The designation or estate authority and chain are established',
            'boolean',
          ),
          f(
            'probateConsistent',
            'The succession follows the applicable probate requirements',
            'boolean',
          ),
          f(
            'competingRightsResolved',
            'Notice, review and competing claims have been addressed',
            'boolean',
          ),
          f(
            'caseAccessNecessary',
            'Authority includes necessary access to this claim file only, and prior delegated access will end',
            'boolean',
          ),
          f(
            'eligibilitySeparate',
            "The worker's eligibility remains a separate finding and the existing claim state is unchanged",
            'boolean',
          ),
          f('legalBasis', 'Succession, case-access, notice and review basis', 'textarea'),
          reasons,
          evidence,
        ],
        'Change control of the same un-enrolled claim in simulation. Do not copy the claim, decide eligibility, transfer an account or create a founding unit.',
      ),
      deny('labor', 'claim'),
      appeal(),
      action(
        'reconsider_denial',
        'Reopen after independent administrative review',
        ['review_requested'],
        'changes_requested',
        ['labor'],
        'claim',
        [reasons, evidence],
        'A different assigned reviewer records why the denied packet may be corrected. No standing or claim control is granted.',
      ),
    ],
  ),
  w(
    'deceased_filing',
    'New deceased-worker filing',
    'Establish personal standing to open one new claim for a deceased worker; eligibility remains separate.',
    ['participant', 'member'],
    [
      f(
        'workerId',
        'Synthetic deceased-worker identity reference',
        'text',
        true,
        'Use an independently supplied synthetic identity reference. Do not sign in as the worker. This reference is not proof of death, authority or eligibility.',
      ),
      f('capacity', 'Requested filing capacity', 'select', true, undefined, [
        'designated_successor',
        'estate_representative',
      ]),
      f('chain', 'Death, designation and succession chain', 'textarea'),
      evidence,
    ],
    [
      action(
        'submit',
        'Submit my deceased-worker filing packet',
        ['draft'],
        'submitted',
        ['participant', 'member'],
        null,
        [
          consent,
          f(
            'rightsAcknowledged',
            "I request one new undivided claim for the worker, not another person's account or an extra unit",
            'boolean',
          ),
        ],
        "The proposed successor must submit personally. This is not proof of the original worker's eligibility.",
      ),
      review('labor', 'claim'),
      action(
        'request_changes',
        'Request a corrected deceased-worker packet',
        ['review'],
        'changes_requested',
        ['labor'],
        'claim',
        [reasons],
        'Explain missing or conflicting evidence. No standing or eligibility is granted.',
      ),
      action(
        'revise_request',
        'Reopen my deceased-worker draft',
        ['changes_requested'],
        'draft',
        ['participant', 'member'],
        null,
        [],
        'Correct and resubmit personally. A new review will bind the corrected worker and capacity.',
      ),
      action(
        'approve',
        'Approve standing to file one new claim',
        ['review'],
        'approved',
        ['labor'],
        'claim',
        [
          f('undivided', 'Exactly one undivided worker claim may be opened', 'boolean'),
          f(
            'deathEstablished',
            'The death of the identified worker is supported by the evidence',
            'boolean',
          ),
          f(
            'identityEstablished',
            'The deceased worker and requesting successor or representative are reliably identified',
            'boolean',
          ),
          f(
            'chainEstablished',
            'The designation or estate authority and chain are established',
            'boolean',
          ),
          f(
            'probateConsistent',
            'The succession follows the applicable probate requirements',
            'boolean',
          ),
          f(
            'competingRightsResolved',
            'Notice, review and competing claims have been addressed',
            'boolean',
          ),
          f(
            'caseAccessNecessary',
            'Authority permits one new claim only, not account access or inheritance of unrelated records',
            'boolean',
          ),
          f(
            'eligibilitySeparate',
            "The worker's eligibility still requires its own evidence and separate decision",
            'boolean',
          ),
          f('legalBasis', 'Succession, case-access, notice and review basis', 'textarea'),
          reasons,
          evidence,
        ],
        'Authorize standing only. The requester may then open one claim draft. Do not certify eligibility, transfer an account or create a founding unit.',
      ),
      action(
        'withdraw_standing',
        'Withdraw my unused standing decision',
        ['approved'],
        'withdrawn',
        ['participant', 'member'],
        null,
        [reasons],
        'Personally withdraw this unused standing before opening a claim. The decision and withdrawal receipts remain in history; any later applicant needs a fresh independent review.',
      ),
      action(
        'open_claim',
        'Prepare the worker’s eligibility claim',
        ['approved'],
        'claim_opened',
        ['participant', 'member'],
        null,
        individualClaimFields.filter((field) => field.key !== 'evidenceIds'),
        'Personally open the one draft covered by this standing decision. Explain the deceased worker’s livelihood and injury; attach that evidence separately before submitting the new claim.',
      ),
      deny('labor', 'claim'),
      appeal(),
      action(
        'reconsider_denial',
        'Reopen after independent administrative review',
        ['review_requested'],
        'changes_requested',
        ['labor'],
        'claim',
        [reasons, evidence],
        'A different assigned reviewer records why the denied packet may be corrected. No standing or claim control is granted.',
      ),
    ],
  ),
  w(
    'association',
    'Cornerstone Association',
    'Form a voluntary, bounded founding roll before ranking.',
    participant,
    [
      f('eventId', 'One represented certified event ID'),
      f(
        'units',
        'Founding units',
        'json',
        true,
        'Array of {claimId, personId}; every linked claim must be eligible.',
      ),
      f('rollOpened', 'Roll opening date', 'date'),
      f('constitution', 'Member rights and governance', 'textarea'),
    ],
    [
      submit(),
      review('labor', 'association'),
      action(
        'withdraw_proposal',
        'Withdraw this unclosed association proposal',
        ['submitted', 'review'],
        'withdrawn',
        participant,
        null,
        [
          reasons,
          f(
            'rightsPreserved',
            'Existing claims and unrelated rights remain intact; no closed unit or compact is changed',
            'boolean',
          ),
        ],
        'End only this open proposal. Preserve personal consent history and allow eligible claims to choose another open cohort.',
      ),
      action(
        'close_roll',
        'Certify and close founding roll',
        ['review'],
        'ready',
        ['labor'],
        'association',
        [
          f('pendingClaims', 'Unresolved timely claims', 'number'),
          f(
            'accessibleMeetings',
            'Accessible meetings remain practical at this scale',
            'boolean',
            false,
          ),
          f(
            'accessibleVoting',
            'Accessible voting remains practical at this scale',
            'boolean',
            false,
          ),
          f(
            'accessibleRecords',
            'Member access to records remains practical at this scale',
            'boolean',
            false,
          ),
          f(
            'practicalDeliberation',
            'Direct member deliberation remains practical at this scale',
            'boolean',
            false,
          ),
          f('equalRights', 'Equal base rights and one founding vote', 'boolean'),
          f('voluntary', 'No forced work, relocation, capital or debt', 'boolean'),
          reasons,
        ],
        'Normally 2–2,500 founding units; one claim on one active roll. All timely eligibility claims must be resolved.',
      ),
      deny('labor', 'association'),
      action(
        'provisional_restoration',
        'Record provisional restoration',
        ['ready'],
        'provisional',
        ['labor'],
        'association',
        [f('launchId', 'Usable launch record ID'), reasons],
        'Requires a legally usable opportunity and feasible training and capital path.',
      ),
      action(
        'final_restoration',
        'Record final restoration',
        ['provisional'],
        'operating',
        ['labor'],
        'association',
        [
          f('operationsStarted', 'Actual operations have started', 'boolean'),
          f('financingClosed', 'Financing has closed', 'boolean'),
          reasons,
        ],
        'Does not guarantee continuing commercial success.',
      ),
    ],
  ),
  w(
    'resolution',
    'Member resolution',
    'Approve a reserved decision by a majority of all founding units.',
    ['member'],
    [
      f('associationId', 'Association ID'),
      f('decision', 'Reserved decision', 'select', true, undefined, [
        'ranking',
        'compact',
        'consortium',
        'merger',
        'dissolution',
        'opportunity_plan',
      ]),
      f('proposal', 'Exact proposal', 'textarea'),
      f(
        'opportunityId',
        'Proposed opportunity ID',
        'text',
        false,
        'Required only for an opportunity-plan vote. The server freezes the exact shared proposal.',
      ),
      f(
        'compactId',
        'Proposed compact ID',
        'text',
        false,
        'Required for a compact vote. Members receive the exact offer, financial method, commercial choices and public commitments.',
      ),
      f(
        'shareCompactTerms',
        'Allow all founding members to inspect the frozen compact terms when voting opens',
        'boolean',
        false,
      ),
    ],
    [
      action(
        'open_vote',
        'Open member vote',
        ['draft'],
        'voting',
        ['member'],
        'association',
        [f('closesAt', 'Voting closes', 'date')],
        'Only active founding units may vote.',
      ),
      action(
        'record_vote',
        'Record unit ballot',
        ['voting'],
        'voting',
        ['member'],
        'association',
        [
          f('unitId', 'Your founding unit ID'),
          f('choice', 'Choice', 'select', true, undefined, ['yes', 'no', 'abstain']),
        ],
        'One ballot per founding unit. The server validates unit authority.',
      ),
      action(
        'tally',
        'Close and tally',
        ['voting'],
        'tallied',
        ['labor'],
        'association',
        [],
        'Approval requires more than half of all frozen units, not merely votes cast.',
      ),
    ],
  ),
  w(
    'opportunity',
    'Opportunity preparation',
    'Prepare feasibility without promising a legal opportunity.',
    participant,
    [
      f('trade', 'Proposed trade'),
      f('district', 'Proposed district'),
      f('feasibility', 'Feasibility evidence', 'textarea'),
    ],
    [
      action(
        'mark_ready',
        'Finish preparation',
        ['draft'],
        'ready',
        participant,
        null,
        [consent],
        'Preparation does not legalize the trade.',
      ),
      action(
        'propose',
        'Share a plan with founding members',
        ['ready'],
        'proposed',
        ['member'],
        null,
        [
          f('associationId', 'Association ID'),
          f('trainingPlan', 'Accessible training and first opportunities', 'textarea'),
          f('capitalPlan', 'Feasible enterprise financing plan', 'textarea'),
          f('permitPlan', 'Ordinary permits and legal prerequisites', 'textarea'),
          f(
            'voluntary',
            'No compulsory work, training, relocation, capital contribution or personal debt',
            'boolean',
          ),
          f(
            'shareWithMembers',
            'Share this plan and its attachments with current founding members and assigned reviewers',
            'boolean',
          ),
        ],
        'Share a fixed planning proposal, not a license, match, financing commitment or restoration finding.',
      ),
      action(
        'adopt_plan',
        'Record the approved member plan',
        ['proposed'],
        'adopted',
        ['member'],
        null,
        [f('memberResolutionId', 'Approved member resolution ID')],
        'Requires a tallied majority of all frozen founding units bound to this exact proposal. Individual participation remains voluntary.',
      ),
      action(
        'withdraw_plan',
        'Withdraw this proposed plan',
        ['proposed'],
        'withdrawn',
        ['member'],
        null,
        [reasons],
        'Only the current member who proposed the plan may withdraw it. Existing member inspection and receipts remain available.',
      ),
    ],
    false,
  ),
  w(
    'state_authority',
    'State authority packet',
    'Document enactment, sector authority, constitutional review, appointments and fiscal rules.',
    ['state'],
    [
      f('jurisdiction', 'State'),
      f('enactment', 'Enacted-law reference'),
      f('sectorAuthority', 'Sector authority', 'textarea'),
      f('constitutionalReview', 'State constitutional review', 'textarea'),
      f('rateAct', 'Prospective rate act'),
      f('financialVersion', 'Common calculation and baseline version'),
      f(
        'financialTerms',
        'Prospective rate and common method in this synthetic authority packet',
        'json',
      ),
      f('fiscalReportReference', 'Public fiscal report reference'),
      f('appointmentReference', 'Public supervisor appointment reference'),
      f('supervisionResources', 'Public supervision resources', 'textarea'),
      f('rulesPublishedDate', 'Recorded final rules publication date', 'date'),
      f('effectiveFrom', 'Recorded authority effective date', 'date'),
      f('validThrough', 'Recorded authority valid through', 'date'),
      evidence,
    ],
    [
      action(
        'submit',
        'Submit authority packet',
        ['draft'],
        'submitted',
        ['state'],
        null,
        [consent],
        'An uploaded text does not itself activate government authority.',
      ),
      action(
        'verify',
        'Record independent verification',
        ['submitted'],
        'verified',
        ['supervisor'],
        'offer',
        [
          f(
            'packetComplete',
            'The synthetic packet documents effective authority, independent appointments, fiscal report, public rules and funded supervision',
            'boolean',
          ),
          reasons,
          evidence,
        ],
        'Freeze this exact synthetic packet and rate. This receipt does not appoint an official, verify actual enactment or activate legal powers.',
      ),
      action(
        'withdraw',
        'Withdraw authority for future offers',
        ['submitted', 'verified'],
        'withdrawn',
        ['state'],
        null,
        [reasons],
        'Preserve historical verification and existing compact obligations. New offer review and publication require current authority.',
      ),
    ],
  ),
  w(
    'objection',
    'Offer or docket objection',
    'Raise no-new-harm concerns, competing rights, or material errors.',
    participant,
    [reference, f('grounds', 'Objection grounds', 'textarea'), evidence],
    [
      submit(),
      review('state', 'offer'),
      action(
        'resolve',
        'Issue objection disposition',
        ['review'],
        'resolved',
        ['state'],
        'offer',
        [
          f('disposition', 'Disposition', 'select', true, undefined, [
            'sustain',
            'deny',
            'revise_and_republish',
          ]),
          reasons,
          evidence,
        ],
        'A material revised offer requires renewed publication before choice.',
      ),
      appeal(['resolved']),
    ],
  ),
  w(
    'offer',
    'State offer',
    'Publish a presently prohibited trade, district and complete fixed terms.',
    ['state'],
    [
      f('authorityId', 'Verified state authority packet ID'),
      f('trade', 'Presently prohibited trade'),
      f('district', 'District boundary and source reference'),
      f('noNewHarm', 'No-new-harm analysis', 'textarea'),
      f('rateAct', 'Prospective flat-rate act'),
      f('financialVersion', 'Common calculation and baseline version'),
      f('financialTerms', 'Published prospective rate, method and protected baseline', 'json'),
      f('commercialMenu', 'Bounded negotiable commercial menu', 'json'),
      f('federalAuthority', 'Express federal authorization, if needed'),
      f('readinessSummary', 'Public technical and financial readiness summary', 'textarea'),
      f('serviceObligations', 'Public service obligations', 'textarea'),
      f('launchRequirements', 'Public launch requirements', 'textarea'),
      f('regulatoryTerms', 'Public regulatory and tax terms', 'textarea'),
      f('publicProtections', 'Public protections and neutral end-of-term regime', 'textarea'),
      evidence,
    ],
    [
      action(
        'submit',
        'Submit for independent review',
        ['draft'],
        'submitted',
        ['state'],
        null,
        [consent],
        'Bind this complete synthetic draft to the exact current authority packet, prospective rate and common method. This does not begin an official offer or objection period.',
      ),
      review('supervisor', 'offer'),
      action(
        'publish',
        'Approve and publish immutable offer',
        ['review'],
        'published',
        ['supervisor'],
        'offer',
        [
          f('rightsProtected', 'Existing lawful rights and markets are protected', 'boolean'),
          f('presentlyProhibited', 'Trade is presently prohibited in the district', 'boolean'),
          f('termsComplete', 'Rate, method, baseline and menu were fixed prospectively', 'boolean'),
          f('publishDate', 'Synthetic publication date (today)', 'date'),
          f('publicFindings', 'Findings disclosed with the published terms', 'textarea'),
          f(
            'discloseTerms',
            'Disclose the listed public terms and authority references to signed-in simulation participants',
            'boolean',
          ),
          reasons,
        ],
        'Freeze the disclosed terms at server acceptance. The complete offer and final rules must be public at least 90 days before rankings close. This synthetic catalogue does not activate an Exchange or perform legal publication.',
      ),
      deny('supervisor', 'offer'),
      action(
        'withdraw',
        'Withdraw prospectively',
        ['submitted', 'review', 'published'],
        'withdrawn',
        ['state'],
        'offer',
        [reasons],
        'A withdrawn offer is unavailable for new rankings; preserve historical versions.',
      ),
    ],
  ),
  w(
    'round',
    'Exchange round',
    'Freeze offers, applicants, deadlines and independently reviewed custody.',
    ['commerce'],
    [
      f('offerIds', 'Published offer IDs', 'json'),
      f('associationIds', 'Ready association IDs', 'json'),
      f('opens', 'Ranking opens', 'date'),
      f('closes', 'Ranking closes', 'date'),
      f('algorithm', 'Algorithm version'),
      f('custodyProtocol', 'Reviewed independent custody protocol'),
    ],
    [
      action(
        'publish',
        'Publish round rules',
        ['draft'],
        'published',
        ['commerce'],
        'exchange',
        [consent],
        'Freeze rules before receiving choices.',
      ),
      action(
        'open',
        'Open ranking',
        ['published'],
        'open',
        ['commerce'],
        'exchange',
        [],
        'All publication periods and readiness checks must be complete.',
      ),
      action(
        'close',
        'Close ranking window',
        ['open'],
        'closed',
        ['commerce'],
        'exchange',
        [],
        'No late private substitutions.',
      ),
      action(
        'compute',
        'Compute replayable matches',
        ['closed'],
        'computed',
        ['commerce'],
        'exchange',
        [f('drawId', 'Published draw record ID')],
        'Requires independently released sealed rankings; a server field key is insufficient.',
      ),
    ],
  ),
  w(
    'sealed_ranking',
    'Sealed association ranking',
    'Submit only acceptable published offers under member-approved choices.',
    ['member'],
    [
      f('roundId', 'Published round ID'),
      f('associationId', 'Ready association ID'),
      f('resolutionId', 'Approved ranking resolution ID'),
    ],
    [
      action(
        'seal',
        'Submit independently sealed ranking',
        ['draft'],
        'sealed',
        ['member'],
        'exchange',
        [f('ciphertextCommitment', 'Reviewed custody envelope commitment')],
        'Disabled until independent custody is implemented and reviewed. Never send plaintext rankings to ordinary infrastructure.',
      ),
      action(
        'replace',
        'Replace before the deadline',
        ['sealed'],
        'sealed',
        ['member'],
        'exchange',
        [f('ciphertextCommitment', 'New custody envelope commitment')],
        'Versioned receipt preserves replacement history.',
      ),
      action(
        'withdraw',
        'Withdraw before the deadline',
        ['sealed'],
        'withdrawn',
        ['member'],
        'exchange',
        [],
        'No private substitution after the deadline.',
      ),
    ],
  ),
  w(
    'draw',
    'Public random tie-break',
    'Record a single independently witnessed random order.',
    ['commerce'],
    [
      f('roundId', 'Frozen round ID'),
      f('witnesses', 'Independent witness IDs', 'json'),
      f('protocol', 'Published draw protocol'),
    ],
    [
      action(
        'publish',
        'Publish verified draw',
        ['draft'],
        'published',
        ['custodian'],
        'exchange',
        [
          f('tieOrder', 'Complete frozen applicant order', 'json'),
          f('transcript', 'Replayable draw transcript'),
        ],
        'No repeated discretionary draw to favor an applicant.',
      ),
    ],
  ),
  w(
    'match',
    'Exchange match',
    'Record the replayable result; officials cannot choose workers.',
    ['commerce'],
    [
      f('roundId', 'Computed round ID'),
      f('associationId', 'Matched association ID'),
      f('offerId', 'Matched published offer ID'),
    ],
    [
      action(
        'accept',
        'Accept match',
        ['draft'],
        'accepted',
        ['member'],
        'exchange',
        [consent],
        'No association or offer may have two active matches.',
      ),
      action(
        'decline',
        'Decline match',
        ['draft'],
        'declined',
        ['member'],
        'exchange',
        [reasons],
        'Retain original choices and willingness for continuation.',
      ),
      action(
        'fail',
        'Record negotiation failure',
        ['accepted'],
        'failed',
        ['commerce'],
        'exchange',
        [reasons],
        'Continuation preserves active matches and remaining original rankings.',
      ),
    ],
  ),
  w(
    'compact',
    'Negotiated compact',
    'Remain within the immutable published offer and worker-control requirements.',
    ['member', 'state'],
    [
      f('offerId', 'Published offer ID'),
      f('associationId', 'Ready association ID'),
      f('matchId', 'Accepted match ID'),
      f('terms', 'Selected terms from published menu', 'json'),
      f('services', 'Services and service obligations', 'textarea', false),
      f('launchMilestones', 'Launch milestones and deadlines', 'textarea', false),
      f('publicProtections', 'Public protections and ordinary law obligations', 'textarea', false),
      f('investorRights', 'Proposed outside capital rights', 'json'),
    ],
    [
      action(
        'submit',
        'Submit compact for review',
        ['draft'],
        'submitted',
        ['member'],
        null,
        [consent, f('memberResolutionId', 'Approved compact resolution ID')],
        'The majority-of-all member vote must cover this exact unchanged draft, fixed offer and complete commercial menu.',
      ),
      review('supervisor', 'compact'),
      action(
        'publish',
        'Publish reviewed compact',
        ['review'],
        'published',
        ['supervisor'],
        'compact',
        [
          f('withinMenu', 'All terms remain in published menu', 'boolean'),
          f('workerControl', 'Founding members retain voting control', 'boolean'),
          f('publishedDate', 'Publication date', 'date'),
          reasons,
        ],
        'Thirty days of public compact review precedes execution.',
      ),
      action(
        'execute',
        'Record authorized execution',
        ['published'],
        'effective',
        ['state'],
        'compact',
        [
          f('effectiveDate', 'Effective date', 'date'),
          f('signatures', 'Validated signatures reference'),
        ],
        'Signature authority and required permits must be verified separately.',
      ),
      deny('supervisor', 'compact'),
    ],
  ),
  w(
    'permit',
    'Permit or license',
    'Track an ordinary regulatory process without impersonating the issuing authority.',
    ['member', 'state'],
    [
      f('compactId', 'Related compact ID'),
      f('permitType', 'Required permit'),
      f('issuingAuthority', 'Actual issuing authority'),
    ],
    [
      action(
        'submit',
        'Record external application',
        ['draft'],
        'submitted',
        ['member'],
        null,
        [f('applicationReference', 'Issuing-authority application reference')],
        'This records an application; it does not file one through an unintegrated agency.',
      ),
      action(
        'verify',
        'Verify issued permit',
        ['submitted'],
        'verified',
        ['state'],
        'compact',
        [
          f('issuedReference', 'Actual issued permit reference'),
          f('validThrough', 'Valid through', 'date'),
          evidence,
        ],
        'Only actual issued authority can satisfy launch readiness.',
      ),
      deny('state', 'compact', ['submitted']),
    ],
  ),
  w(
    'launch',
    'Enterprise launch',
    'Verify a usable legal, financial, training and operating path.',
    ['member'],
    [
      f('associationId', 'Association ID'),
      f('compactId', 'Effective compact ID'),
      f('permitIds', 'Verified permit record IDs', 'json'),
      f('plan', 'Feasibility and training plan', 'textarea'),
    ],
    [
      submit(),
      review('labor', 'association'),
      action(
        'approve',
        'Approve launch readiness',
        ['review'],
        'ready',
        ['labor'],
        'association',
        [
          f('financingFeasible', 'Financing is feasible', 'boolean'),
          f('trainingAccessible', 'First-opportunity training and work are accessible', 'boolean'),
          reasons,
        ],
        'Provisional restoration requires a usable opportunity.',
      ),
      action(
        'operate',
        'Verify actual operations',
        ['ready'],
        'operating',
        ['labor'],
        'association',
        [
          f('financingClosed', 'Financing closed', 'boolean'),
          f('operationsStarted', 'Actual operations started', 'boolean'),
          evidence,
          reasons,
        ],
        'Final restoration requires actual operations.',
      ),
      action(
        'return',
        'Return before launch',
        ['draft', 'submitted', 'review', 'ready'],
        'returned',
        ['member'],
        null,
        [reasons],
        'Claim eligibility survives a returned pre-opening opportunity.',
      ),
    ],
  ),
  w(
    'fund_commitment',
    'Founding Fund advance',
    'Approve limited enterprise-only formation, feasibility, licensing and training costs.',
    ['member'],
    [
      f('associationId', 'Association ID'),
      f('principal', 'Requested principal', 'money'),
      f('budget', 'Eligible cost budget', 'json'),
    ],
    [
      submit(),
      review('fiscal', 'fund'),
      action(
        'approve',
        'Approve fixed commitment',
        ['review'],
        'approved',
        ['fiscal'],
        'fund',
        [
          f('fixedReturn', 'Fixed public return', 'money'),
          f('receiptRate', 'Predetermined receipt-rate fraction', 'json'),
          f('appropriationReference', 'Available appropriation'),
          f('enterpriseOnly', 'No member debt or guarantee', 'boolean'),
          reasons,
        ],
        'A commitment is not an actual Treasury disbursement.',
      ),
      action(
        'confirm_transfer',
        'Record independently confirmed transfer',
        ['approved'],
        'disbursed',
        ['fiscal'],
        'fund',
        [f('transferReference', 'Verified Treasury acceptance and transfer reference'), evidence],
        'Do not mark a queued instruction as paid.',
      ),
      deny('fiscal', 'fund'),
    ],
  ),
  w(
    'fund_payment',
    'Founding Fund remittance',
    'Apply a predetermined capped payment and permanent terminal release.',
    ['member'],
    [
      f('fundId', 'Disbursed Fund commitment ID'),
      f('grossReceipts', 'Actual gross operating receipts', 'money'),
      f('financing', 'Financing included in gross', 'money'),
      f('refunds', 'Refunds included in gross', 'money'),
      f('taxes', 'Collected taxes included in gross', 'money'),
    ],
    [
      submit(),
      action(
        'calculate',
        'Calculate predetermined remittance',
        ['submitted'],
        'calculated',
        ['fiscal'],
        'fund',
        [],
        'The last payment is capped at the fixed remaining obligation.',
      ),
      action(
        'confirm_transfer',
        'Confirm settled payment',
        ['calculated'],
        'paid',
        ['fiscal'],
        'fund',
        [f('transferReference', 'Settled transfer reference'), evidence],
        'Only a confirmed transfer changes the collected ledger.',
      ),
    ],
  ),
  w(
    'financial_schedule',
    'Annual state-share schedule',
    'Apply the published common method, prior losses and bounded cash allowances.',
    ['member'],
    [
      f('compactId', 'Effective compact ID'),
      f('fiscalYear', 'Fiscal year', 'number'),
      f('schedule', 'Verified cash-method schedule', 'json'),
    ],
    [
      submit(),
      action(
        'calculate',
        'Calculate published state share',
        ['submitted'],
        'calculated',
        ['fiscal'],
        'finance',
        financialNotice,
        'No positive shareable surplus means no payment. No private percentage negotiation.',
      ),
      action(
        'correct',
        'Issue transparent calculation correction',
        ['calculated'],
        'calculated',
        ['fiscal'],
        'finance',
        [f('schedule', 'Corrected schedule', 'json'), ...financialNotice, reasons],
        'Correct inputs and errors under the same published method.',
      ),
      action(
        'request_review',
        'Appeal calculation',
        ['calculated'],
        'review_requested',
        ['member'],
        null,
        [
          f(
            'disputedAmount',
            'Amount disputed in this calculation',
            'money',
            true,
            'Use zero for a classification-only appeal of a zero calculation. Undisputed amounts are not stayed by requesting review.',
          ),
          reasons,
        ],
        'Undisputed payments remain due; disputed amounts follow published review rules.',
      ),
      action(
        'begin_calculation_review',
        'Schedule independent calculation review',
        ['review_requested'],
        'calculation_review',
        ['adjudicator'],
        'review',
        [
          f('hearingDate', 'Synthetic hearing date', 'date'),
          f('noticeReference', 'Synthetic hearing notice reference'),
        ],
        'An assigned adjudicator from a different institution reviews the appeal. Synthetic notice does not establish legal service.',
      ),
      action(
        'record_calculation_hearing',
        'Record hearing and close evidence',
        ['calculation_review'],
        'calculation_heard',
        ['adjudicator'],
        'review',
        [f('hearingRecord', 'Synthetic hearing record', 'textarea'), evidence],
        'Record the hearing on or after its scheduled date and freeze the selected validated attachments. This closes evidence preparation for the decision.',
      ),
      action(
        'decide_calculation_review',
        'Record reasoned calculation decision',
        ['calculation_heard'],
        'review_decided',
        ['adjudicator'],
        'review',
        [
          f('disposition', 'Calculation decision', 'select', true, undefined, [
            'affirm',
            'correct',
          ]),
          f('schedule', 'Reviewed schedule', 'json'),
          reasons,
          f('judicialReviewRoute', 'Available judicial review route', 'textarea'),
        ],
        'Review can correct inputs and classification under the original rate and method. No payment, refund, legal filing or collection stay is executed.',
      ),
      action(
        'confirm_transfer',
        'Confirm state-land-account payment',
        ['calculated'],
        'paid',
        ['fiscal'],
        'finance',
        [f('transferReference', 'Verified state land-account receipt'), evidence],
        'No government equity or control is created.',
      ),
    ],
  ),
  w(
    'land_acquisition',
    'State land acquisition',
    'Track dedicated funds, voluntary appraised purchase and lawful appropriation.',
    ['state'],
    [
      f('propertyReference', 'Property record reference'),
      f('publicPurpose', 'Authorized land purpose', 'textarea'),
      f('appraisal', 'Independent appraisal reference'),
      f('appropriation', 'Available appropriation'),
    ],
    [
      action(
        'submit',
        'Submit acquisition packet',
        ['draft'],
        'submitted',
        ['state'],
        null,
        [consent],
        'The account does not itself authorize eminent domain or a purchase.',
      ),
      action(
        'approve',
        'Approve lawful voluntary acquisition',
        ['submitted'],
        'approved',
        ['fiscal'],
        'finance',
        [
          f('voluntary', 'Seller participates voluntarily', 'boolean'),
          f('dedicatedFunds', 'Only dedicated available funds are used', 'boolean'),
          reasons,
        ],
        'State-specific land and appropriation law governs.',
      ),
      action(
        'settle',
        'Record settlement',
        ['approved'],
        'settled',
        ['fiscal'],
        'finance',
        [f('settlementReference', 'Actual recorded settlement'), evidence],
        'A review approval is not proof of settlement.',
      ),
    ],
  ),
  w(
    'supervision',
    'Independent public supervision',
    'Substantively approve, modify or reject covered conduct.',
    ['supervisor'],
    [
      f('compactId', 'Effective compact ID'),
      f('conduct', 'Conduct under review', 'textarea'),
      f('scope', 'Supervision scope and applicable protective law', 'textarea'),
    ],
    [
      action(
        'open_review',
        'Open review',
        ['draft'],
        'review',
        ['supervisor'],
        'supervision',
        [],
        'Supervisor independence and actual review are required.',
      ),
      action(
        'decide',
        'Publish substantive supervision decision',
        ['review'],
        'decided',
        ['supervisor'],
        'supervision',
        [
          f('disposition', 'Disposition', 'select', true, undefined, [
            'approve',
            'modify',
            'reject',
          ]),
          reasons,
          evidence,
        ],
        'Silence is not approval. Supervision creates no corporate board or management right.',
      ),
    ],
  ),
  w(
    'enforcement',
    'Material-violation procedure',
    'Provide notice, cure, hearing and review before revocation.',
    ['supervisor'],
    [
      f('compactId', 'Compact ID'),
      f('grounds', 'Specific material violation', 'textarea'),
      evidence,
    ],
    [
      action(
        'notice',
        'Issue violation notice',
        ['draft'],
        'notice',
        ['supervisor'],
        'supervision',
        [
          f('noticeDate', 'Valid notice date', 'date'),
          f('cureDeadline', 'Cure deadline', 'date'),
          reasons,
        ],
        'Ordinarily allow at least 60 days to cure.',
      ),
      action(
        'record_cure',
        'Record accepted cure',
        ['notice', 'hearing'],
        'cured',
        ['supervisor'],
        'supervision',
        [reasons, evidence],
        'Good-faith financial correction is not automatic revocation.',
      ),
      action(
        'schedule_hearing',
        'Schedule merits hearing',
        ['notice'],
        'hearing',
        ['adjudicator'],
        'review',
        [f('hearingDate', 'Hearing date', 'date'), f('hearingRecord', 'Hearing record reference')],
        'Preserve access to evidence and a neutral hearing.',
      ),
      action(
        'revoke',
        'Issue reviewable revocation',
        ['hearing'],
        'revoked',
        ['adjudicator'],
        'review',
        [
          f(
            'materialViolationEstablished',
            'Material violation established after hearing',
            'boolean',
          ),
          f('cureOpportunity', 'Required cure opportunity was provided', 'boolean'),
          reasons,
          evidence,
        ],
        'Only enumerated material grounds support revocation.',
      ),
      action(
        'emergency',
        'Issue temporary emergency restriction',
        ['draft', 'notice'],
        'emergency',
        ['supervisor'],
        'supervision',
        [
          f('seriousImminentHarm', 'Serious imminent harm established', 'boolean'),
          f('noticeDate', 'Emergency order date', 'date'),
          f('hearingDate', 'Prompt hearing date', 'date'),
          reasons,
          evidence,
        ],
        'A hearing must occur within 10 days; preserve prompt review.',
      ),
      appeal(['revoked', 'emergency']),
    ],
  ),
  w(
    'renewal',
    'Compact renewal',
    'Record the single conditional automatic ten-year renewal.',
    ['member', 'state'],
    [f('compactId', 'Effective compact ID')],
    [
      action(
        'review',
        'Record renewal review',
        ['draft'],
        'reviewed',
        ['supervisor'],
        'supervision',
        [
          f('controlContinues', 'Worker voting control continues', 'boolean'),
          f(
            'uncuredViolationEstablished',
            'An uncured disqualifying violation is established',
            'boolean',
          ),
          f('stayed', 'Adverse determination is stayed', 'boolean'),
          reasons,
        ],
        'Administrative silence cannot defeat an otherwise automatic renewal.',
      ),
    ],
  ),
  w(
    'handoff',
    'Assisted or external handoff',
    'Make an accessible handoff and preserve an honest status.',
    participant,
    [
      reference,
      f('route', 'Requested route', 'select', true, undefined, [
        'assisted_intake',
        'mail',
        'telephone',
        'agency',
        'judicial_review',
      ]),
      f('need', 'What assistance is needed', 'textarea'),
    ],
    [
      submit(),
      action(
        'acknowledge',
        'Acknowledge assistance request',
        ['submitted'],
        'acknowledged',
        ['support'],
        null,
        [f('actualRoute', 'Actual available route and contact')],
        'A website receipt is not a court or external agency filing.',
      ),
      action(
        'confirm',
        'Record confirmed external acceptance',
        ['acknowledged'],
        'confirmed',
        ['support'],
        null,
        [f('acceptanceReference', 'Actual external acceptance reference'), evidence],
        'Do not invent an external acceptance receipt.',
      ),
    ],
    false,
  ),
  w(
    'support_request',
    'Help request',
    'Ask about using the website, with scoped support access.',
    participant,
    [f('topic', 'Help topic'), f('question', 'Question', 'textarea')],
    [
      submit(),
      action(
        'respond',
        'Provide a response',
        ['submitted'],
        'answered',
        ['support'],
        null,
        [f('response', 'Response', 'textarea')],
        'Support does not make program findings.',
      ),
    ],
    false,
  ),
  w(
    'privacy_request',
    'Access or correction request',
    'Request an export, correction or retention review.',
    participant,
    [
      f('requestType', 'Request type', 'select', true, undefined, [
        'access',
        'export',
        'correction',
        'retention_review',
        'representation_revocation',
      ]),
      f('details', 'Scope of request', 'textarea'),
    ],
    [
      submit(),
      action(
        'respond',
        'Record privacy response',
        ['submitted'],
        'answered',
        ['support'],
        null,
        [f('response', 'Response and actual action', 'textarea')],
        'Legal holds and immutable decision history need a documented response; do not falsely promise deletion.',
      ),
    ],
    false,
  ),
];
export function workflow(kind: Kind): WorkflowDefinition {
  const result = workflows.find((w) => w.kind === kind);
  if (!result) throw new DomainError('UNKNOWN_WORKFLOW', 'Unknown workflow.');
  return result;
}
export function parseFields(
  fields: Field[],
  input: Record<string, unknown>,
): Record<string, unknown> {
  const known = new Set(fields.map((f) => f.key));
  for (const key of Object.keys(input))
    requireCondition(known.has(key), 'UNKNOWN_FIELD', `Unexpected field: ${key}`);
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = input[field.key];
    if (value === undefined || value === null || value === '') {
      requireCondition(!field.required, 'REQUIRED_FIELD', `${field.label} is required.`);
      continue;
    }
    if (field.type === 'boolean') {
      requireCondition(
        typeof value === 'boolean',
        'INVALID_FIELD',
        `${field.label} must be true or false.`,
      );
      out[field.key] = value;
    } else if (field.type === 'number') {
      requireCondition(
        typeof value === 'number' &&
          Number.isFinite(value) &&
          value >= 0 &&
          value <= Number.MAX_SAFE_INTEGER,
        'INVALID_FIELD',
        `${field.label} must be a finite nonnegative number.`,
      );
      out[field.key] = value;
    } else if (field.type === 'json') {
      requireCondition(
        typeof value === 'object' &&
          JSON.stringify(value).length <= (field.key === 'units' ? 1000000 : 100000),
        'INVALID_FIELD',
        `${field.label} must be structured data.`,
      );
      if (
        [
          'evidenceIds',
          'offerIds',
          'associationIds',
          'witnesses',
          'tieOrder',
          'permitIds',
        ].includes(field.key)
      ) {
        requireCondition(Array.isArray(value), 'INVALID_REFERENCES', 'Use a list of record IDs.');
        out[field.key] = value.map((id) => IdSchema.parse(id));
      } else if (field.key === 'units') out[field.key] = FoundingUnitsSchema.parse(value);
      else if (field.key === 'budget') out[field.key] = FundBudgetSchema.parse(value);
      else if (field.key === 'receiptRate') out[field.key] = FractionSchema.parse(value);
      else if (field.key === 'investorRights') out[field.key] = InvestorRightsSchema.parse(value);
      else if (field.key === 'financialTerms') out[field.key] = StateTermsSchema.parse(value);
      else if (field.key === 'schedule') out[field.key] = SurplusPreparationSchema.parse(value);
      else if (field.key === 'commercialMenu') out[field.key] = CommercialMenuSchema.parse(value);
      else if (field.key === 'terms') out[field.key] = CommercialTermsSchema.parse(value);
      else out[field.key] = value;
    } else {
      requireCondition(
        typeof value === 'string' && value.trim().length > 0 && value.length <= 12000,
        'INVALID_FIELD',
        `${field.label} must be text under 12,000 characters.`,
      );
      if (field.type === 'date') DateSchema.parse(value);
      if (field.type === 'money') MoneySchema.parse(value);
      if (field.type === 'select')
        requireCondition(
          field.options?.includes(value),
          'INVALID_OPTION',
          'Choose a published option.',
        );
      out[field.key] = value.trim();
    }
  }
  return out;
}
export function validateAction(
  record: CaseRecord,
  key: string,
  input: Record<string, unknown>,
  today: string,
) {
  const d = { ...record.data, ...input };
  const yes = (key: string, message: string) =>
    requireCondition(d[key] === true, 'REQUIRED_FINDING', message);
  if (key === 'submit') yes('attested', 'Confirm the submission.');
  if (record.kind === 'opportunity' && key === 'mark_ready')
    yes('attested', 'Confirm the preparation.');
  if (record.kind === 'opportunity' && key === 'propose') {
    yes(
      'voluntary',
      'Individual participation must remain voluntary and free from personal debt or compulsory contributions.',
    );
    yes(
      'shareWithMembers',
      'Explicitly authorize member and assigned-reviewer inspection of this plan and its attachments.',
    );
  }
  if (record.kind === 'event_petition' && key === 'close_record')
    requireCondition(
      today >= addCalendarDays(String(d['noticeDate']), 60),
      'NOTICE_PERIOD',
      'The public evidence period is still open.',
    );
  if (record.kind === 'event_petition' && key === 'certify')
    for (const name of [
      'implemented',
      'lawfulIndustry',
      'deliberateObjective',
      'materialDirectGroup',
    ])
      yes(name, 'All event criteria require written findings.');
  if (record.kind === 'claim' && key === 'find_eligible') {
    requireCondition(
      principalLivelihood(
        typeof d['earnedIncomeShare'] === 'number' ? d['earnedIncomeShare'] : null,
        typeof d['annualHours'] === 'number' ? d['annualHours'] : null,
      ),
      'PRINCIPAL_LIVELIHOOD',
      'A documented principal livelihood baseline is required.',
    );
    yes('directInjuryProven', 'Direct material injury must be proven.');
    if (d['workerType'] === 'direct_supplier')
      yes('supplierDirectDependence', 'A direct supplier must meet the separate dependence test.');
  }
  if (record.kind === 'claim' && key === 'return_unremedied') {
    yes('governmentDefeat', 'A qualifying government defeat needs a Labor finding.');
    requireCondition(
      d['ownMaterialBreach'] === false,
      'OWN_BREACH',
      'An association’s own material breach does not qualify.',
    );
  }
  if (['succession', 'claim_survival', 'deceased_filing'].includes(record.kind) && key === 'submit')
    yes('rightsAcknowledged', 'Personally acknowledge the undivided rights and limits.');
  if (
    ['succession', 'claim_survival', 'deceased_filing'].includes(record.kind) &&
    key === 'approve'
  )
    for (const name of [
      'undivided',
      'deathEstablished',
      'identityEstablished',
      'chainEstablished',
      'probateConsistent',
      'competingRightsResolved',
    ])
      yes(name, 'A complete evidence-based succession finding is required.');
  if (['claim_survival', 'deceased_filing'].includes(record.kind) && key === 'approve') {
    yes('caseAccessNecessary', 'Record the necessary authority over this specific claim file.');
    yes('eligibilitySeparate', 'Succession cannot replace the worker eligibility finding.');
  }
  if (record.kind === 'association' && key === 'withdraw_proposal')
    yes('rightsPreserved', 'Withdrawing an unclosed proposal does not forfeit any claim.');
  if (record.kind === 'association' && key === 'close_roll') {
    yes('equalRights', 'Equal base rights and votes are required.');
    yes('voluntary', 'Participation must remain voluntary.');
  }
  if (record.kind === 'offer' && key === 'publish')
    for (const name of ['rightsProtected', 'presentlyProhibited', 'termsComplete'])
      yes(name, 'Legal authority, existing rights and published terms must be established.');
  if (record.kind === 'compact' && key === 'publish') {
    yes('withinMenu', 'Compact terms must remain within the published menu.');
    yes('workerControl', 'Worker voting control must continue.');
    const r = d['investorRights'] as Parameters<typeof validateCapitalRights>[0];
    requireCondition(
      r &&
        ['investorVotes', 'boardSeat', 'governanceVeto', 'unitPledge', 'compactForeclosure'].every(
          (k) => typeof (r as unknown as Record<string, unknown>)[k] === 'boolean',
        ),
      'INVALID_CAPITAL_RIGHTS',
      'Document each outside-capital right.',
    );
    validateCapitalRights(r);
  }
  if (record.kind === 'compact' && key === 'execute')
    requireCondition(
      today >= addCalendarDays(String(d['publishedDate']), 30),
      'NOTICE_PERIOD',
      'The compact publication period is still open.',
    );
  if (record.kind === 'fund_commitment' && key === 'approve')
    yes('enterpriseOnly', 'No member debt or personal guarantee is permitted.');
  if (record.kind === 'launch' && key === 'approve')
    for (const name of ['financingFeasible', 'trainingAccessible'])
      yes(name, 'A usable feasible launch path is required.');
  if (
    (record.kind === 'launch' && key === 'operate') ||
    (record.kind === 'association' && key === 'final_restoration')
  )
    for (const name of ['financingClosed', 'operationsStarted'])
      yes(name, 'Final restoration requires financing and actual operations.');
  if (record.kind === 'land_acquisition' && key === 'approve')
    for (const name of ['voluntary', 'dedicatedFunds'])
      yes(name, 'A lawful voluntary purchase from dedicated available funds is required.');
  if (record.kind === 'enforcement' && key === 'notice')
    requireCondition(
      String(d['cureDeadline']) >= addCalendarDays(String(d['noticeDate']), 60),
      'CURE_PERIOD',
      'Provide the required ordinary cure period.',
    );
  if (record.kind === 'enforcement' && key === 'revoke')
    for (const name of ['materialViolationEstablished', 'cureOpportunity'])
      yes(name, 'Revocation requires a material finding and due process.');
  if (record.kind === 'enforcement' && key === 'emergency') {
    yes('seriousImminentHarm', 'An emergency restriction requires serious imminent harm.');
    requireCondition(
      String(d['hearingDate']) >= String(d['noticeDate']) &&
        String(d['hearingDate']) <= addCalendarDays(String(d['noticeDate']), 10),
      'EMERGENCY_HEARING',
      'An emergency hearing must occur within ten days.',
    );
  }
  return d;
}
export const workflowGroups = [
  {
    label: 'Prepare & participate',
    kinds: [
      'dossier',
      'organizing_group',
      'event_petition',
      'claim',
      'hearing',
      'succession',
      'claim_survival',
      'deceased_filing',
    ],
  },
  {
    label: 'Members & enterprise',
    kinds: ['association', 'resolution', 'opportunity', 'match', 'compact', 'permit', 'launch'],
  },
  {
    label: 'States & exchange',
    kinds: ['state_authority', 'objection', 'offer', 'round', 'sealed_ranking', 'draw'],
  },
  {
    label: 'Finance & oversight',
    kinds: [
      'fund_commitment',
      'fund_payment',
      'financial_schedule',
      'land_acquisition',
      'supervision',
      'enforcement',
      'renewal',
    ],
  },
  { label: 'Help & rights', kinds: ['handoff', 'support_request', 'privacy_request'] },
] as const;
