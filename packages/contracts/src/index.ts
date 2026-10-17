import { z } from 'zod';

export const ModeSchema = z.enum(['proposal', 'simulation', 'authorized']);
export type Mode = z.infer<typeof ModeSchema>;
export const RealmSchema = z.enum(['proposal', 'simulation', 'program']);
export type Realm = z.infer<typeof RealmSchema>;
export const RoleSchema = z.enum([
  'participant',
  'representative',
  'member',
  'provider',
  'investor',
  'labor',
  'commerce',
  'state',
  'supervisor',
  'adjudicator',
  'fiscal',
  'auditor',
  'support',
  'technical_admin',
  'publisher',
  'custodian',
]);
export type Role = z.infer<typeof RoleSchema>;
export const IdSchema = z.string().uuid();
export const InstantSchema = z.string().datetime({ offset: true });
export const RecordPageQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(200),
    cursor: z
      .string()
      .min(1)
      .max(2048)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .strict();
export const RecordQuerySchema = z.union([
  z.object({ recordId: IdSchema }).strict(),
  RecordPageQuerySchema,
]);
export const RecordCursorSchema = z
  .object({
    version: z.literal(1),
    id: IdSchema,
    updatedAt: InstantSchema,
  })
  .strict();
export const WorkspaceSessionSchema = z
  .object({
    id: IdSchema,
    authenticatedAt: InstantSchema,
    expiresAt: InstantSchema,
    current: z.boolean(),
  })
  .strict();
export type WorkspaceSession = z.infer<typeof WorkspaceSessionSchema>;
export const RevokeSessionSchema = z.object({ id: IdSchema }).strict();
export const draftAccessKinds = [
  'dossier',
  'organizing_group',
  'event_petition',
  'claim',
  'support_request',
] as const;
const AccessCommandFields = {
  recordId: IdSchema,
  expectedVersion: z.number().int().positive(),
  idempotencyKey: IdSchema,
};
export const GrantDraftAccessSchema = z
  .object({
    ...AccessCommandFields,
    subjectId: IdSchema,
    expiresAt: InstantSchema,
    allowDraftEdits: z.boolean(),
    consent: z.literal(true),
  })
  .strict();
export const RevokeDraftAccessSchema = z
  .object({ ...AccessCommandFields, grantId: IdSchema })
  .strict();
export const DraftAccessViewSchema = z
  .object({
    id: IdSchema,
    subjectId: IdSchema,
    permissions: z.array(z.string().min(1).max(80)),
    expiresAt: InstantSchema,
    revokedAt: InstantSchema.nullable(),
  })
  .strict();
export type DraftAccessView = z.infer<typeof DraftAccessViewSchema>;
export const RecordCapabilitiesSchema = z
  .object({
    recordId: IdSchema,
    version: z.number().int().positive(),
    actions: z.array(z.string().min(1).max(80)),
  })
  .strict();
export type RecordCapabilities = z.infer<typeof RecordCapabilitiesSchema>;
export const RecordReadContextSchema = z.object({ actorId: IdSchema, realm: RealmSchema }).strict();
export const ActivityNotificationSchema = z
  .object({
    id: IdSchema,
    recordId: IdSchema,
    receiptId: IdSchema,
    version: z.number().int().positive(),
    action: z.string().regex(/^[a-z][a-z0-9_]{0,99}$/),
    createdAt: InstantSchema,
    readAt: InstantSchema.nullable(),
    classification: z.literal('activity'),
    channel: z.literal('in_app'),
    legalService: z.literal(false),
    realm: z.literal('simulation'),
  })
  .strict();
export type ActivityNotification = z.infer<typeof ActivityNotificationSchema>;
export const ActivityPageQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z
      .string()
      .min(1)
      .max(2048)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .strict();
export const ActivityCursorSchema = z
  .object({ version: z.literal(1), id: IdSchema, createdAt: InstantSchema })
  .strict();
export const ActivityPageSchema = z
  .object({
    notifications: z.array(ActivityNotificationSchema).max(100),
    nextCursor: z.string().max(2048).nullable(),
    unreadCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export const ActivityReadResultSchema = z
  .object({
    read: z.literal(true),
    legalService: z.literal(false),
    marked: z.array(z.object({ id: IdSchema, readAt: InstantSchema }).strict()).max(100),
    unreadCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export const MarkActivityReadSchema = z.object({ ids: z.array(IdSchema).min(1).max(100) }).strict();
export const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  }, 'Use a valid calendar date');
export const FoundingInvitationViewSchema = z
  .object({
    id: IdSchema,
    associationId: IdSchema,
    claimId: IdSchema,
    personId: IdSchema,
    termsDigest: z.string().regex(/^[a-f0-9]{64}$/),
    closesOn: DateSchema,
    response: z.enum(['pending', 'accepted', 'declined']),
    respondedAt: InstantSchema.nullable(),
    ownScaleChoice: z.enum(['yes', 'no', 'abstain']).nullable(),
  })
  .strict();
export type FoundingInvitationView = z.infer<typeof FoundingInvitationViewSchema>;
export const FoundingMembershipViewSchema = z
  .object({
    unitId: IdSchema,
    associationId: IdSchema,
    claimId: IdSchema,
    successor: z.boolean(),
  })
  .strict();
export type FoundingMembershipView = z.infer<typeof FoundingMembershipViewSchema>;
export const MembershipSnapshotSchema = z
  .object({
    context: RecordReadContextSchema,
    invitations: z.array(FoundingInvitationViewSchema),
    units: z.array(FoundingMembershipViewSchema),
    realm: z.literal('simulation'),
    officialMembership: z.literal(false),
  })
  .strict();
export type MembershipSnapshot = z.infer<typeof MembershipSnapshotSchema>;
export const FoundingRollViewSchema = z
  .object({
    invitations: z.array(FoundingInvitationViewSchema),
    fullRoll: z.boolean(),
    realm: z.literal('simulation'),
  })
  .strict();
export type FoundingRollView = z.infer<typeof FoundingRollViewSchema>;
export const RespondFoundingInvitationSchema = z
  .object({
    recordId: IdSchema,
    invitationId: IdSchema,
    expectedVersion: z.number().int().positive(),
    idempotencyKey: IdSchema,
    response: z.enum(['accepted', 'declined']),
    rightsAcknowledged: z.boolean(),
    scaleChoice: z.enum(['yes', 'no', 'abstain']).optional(),
  })
  .strict()
  .refine(
    (v) => v.response === 'declined' || v.rightsAcknowledged,
    'Acknowledge voluntary membership and equal founding rights before accepting',
  );
export const MemberBallotViewSchema = z
  .object({
    resolutionId: IdSchema,
    associationId: IdSchema,
    unitCount: z.number().int().min(2).nullable(),
    rollDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    closesOn: DateSchema.nullable(),
    ownUnits: z.array(IdSchema),
    castUnits: z.array(IdSchema),
    ownBallots: z.array(
      z
        .object({
          unitId: IdSchema,
          choice: z.enum(['yes', 'no', 'abstain']),
          receiptId: IdSchema,
          commitment: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    ),
    realm: z.literal('simulation'),
    cryptographicallySealed: z.literal(false),
  })
  .strict();
export type MemberBallotView = z.infer<typeof MemberBallotViewSchema>;
export const MAX_SYNTHETIC_EVIDENCE_BYTES = 262144;
export const MAX_SYNTHETIC_ATTACHMENTS = 10;
export const EvidenceFilenameSchema = z
  .string()
  .trim()
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 _.-]*\.txt$/i);
const EvidenceSourceUrlSchema = z
  .string()
  .max(2000)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  }, 'Use an HTTP(S) source URL without credentials');
export const EvidenceMetadataSchema = z
  .object({
    filename: EvidenceFilenameSchema,
    description: z.string().trim().min(3).max(2000),
    sourceUrl: EvidenceSourceUrlSchema.optional(),
    sourceDate: DateSchema.optional(),
    plaintextSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const UploadSyntheticEvidenceSchema = z
  .object({
    recordId: IdSchema,
    expectedVersion: z.number().int().positive(),
    idempotencyKey: IdSchema,
    filename: EvidenceFilenameSchema,
    description: z.string().trim().min(3).max(2000),
    sourceUrl: EvidenceSourceUrlSchema.optional(),
    sourceDate: DateSchema.optional(),
    base64: z
      .string()
      .min(4)
      .max(Math.ceil(MAX_SYNTHETIC_EVIDENCE_BYTES / 3) * 4)
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
    attestedSynthetic: z.literal(true),
  })
  .strict();
export const ValidateSyntheticEvidenceSchema = z
  .object({
    recordId: IdSchema,
    evidenceId: IdSchema,
    expectedVersion: z.number().int().positive(),
    idempotencyKey: IdSchema,
  })
  .strict();
export const EvidenceViewSchema = EvidenceMetadataSchema.extend({
  id: IdSchema,
  recordId: IdSchema,
  uploaderId: IdSchema,
  byteLength: z.number().int().min(1).max(MAX_SYNTHETIC_EVIDENCE_BYTES),
  state: z.enum(['quarantined', 'scanning', 'clean', 'rejected']),
  createdAt: InstantSchema,
  checkedAt: InstantSchema.nullable(),
  checkMethod: z.literal('synthetic_text_v1').nullable(),
  rejectionCode: z.enum(['INVALID_TEXT', 'INTEGRITY']).nullable(),
  mediaType: z.literal('text/plain'),
  realm: z.literal('simulation'),
  classification: z.literal('synthetic_evidence'),
  securityScan: z.literal('not_performed'),
  legalAcceptance: z.literal(false),
}).strict();
export type EvidenceView = z.infer<typeof EvidenceViewSchema>;
export const EvidencePageSchema = z
  .object({
    context: RecordReadContextSchema,
    recordId: IdSchema,
    version: z.number().int().positive(),
    enabled: z.boolean(),
    evidence: z.array(EvidenceViewSchema).max(MAX_SYNTHETIC_ATTACHMENTS),
  })
  .strict();
export type EvidencePage = z.infer<typeof EvidencePageSchema>;
export const MoneySchema = z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{2})?$/);
const LedgerIdSchema = z.string().min(1).max(200);
export const FractionSchema = z
  .object({
    numerator: z.string().regex(/^(0|[1-9]\d{0,17})$/),
    denominator: z.string().regex(/^[1-9]\d{0,17}$/),
  })
  .strict()
  .refine((r) => BigInt(r.numerator) <= BigInt(r.denominator), 'A fraction cannot exceed one');
export const StateTermsSchema = z
  .object({
    version: z.string().min(1).max(100),
    rateActId: LedgerIdSchema,
    rate: FractionSchema.refine(
      (r) => BigInt(r.numerator) > 0n,
      'A prospective state rate must be published',
    ),
    workingCapitalMonths: z.literal(6),
    ordinaryHorizonMonths: z.literal(36),
    growthLimit: z.object({ numerator: z.literal('1'), denominator: z.literal('2') }).strict(),
  })
  .strict();
export const FoundingUnitsSchema = z.array(
  z.object({ claimId: IdSchema, personId: IdSchema }).strict(),
);
export const FundBudgetSchema = z
  .array(
    z
      .object({
        kind: z.enum(['formation', 'feasibility', 'licensing', 'training']),
        amount: MoneySchema,
      })
      .strict(),
  )
  .min(1);
export const InvestorRightsSchema = z
  .object({
    investorVotes: z.boolean(),
    boardSeat: z.boolean(),
    governanceVeto: z.boolean(),
    unitPledge: z.boolean(),
    compactForeclosure: z.boolean(),
  })
  .strict();
export const SurplusScheduleSchema = z
  .object({
    enterpriseId: LedgerIdSchema,
    year: z.number().int().min(1).max(9999),
    yearEnd: DateSchema,
    terms: StateTermsSchema,
    grossReceipts: MoneySchema,
    financingProceeds: MoneySchema,
    refunds: MoneySchema,
    collectedTaxes: MoneySchema,
    recoveriesAndReleasedAllowances: MoneySchema,
    ordinaryAnnualOperatingCosts: MoneySchema,
    cashCycleShortfall: MoneySchema,
    priorDeductionSourceIds: z.array(LedgerIdSchema),
    costs: z.array(
      z
        .object({
          id: LedgerIdSchema,
          sourceId: LedgerIdSchema,
          kind: z.enum([
            'operating',
            'wages',
            'tax',
            'interest',
            'fund',
            'debt_principal',
            'distribution',
            'depreciation',
            'amortization',
            'state_share',
          ]),
          paid: MoneySchema,
          reserved: MoneySchema.optional(),
          eligibleAmount: MoneySchema,
          fundFinanced: z.boolean(),
          previouslyDeducted: z.boolean(),
          required: z.boolean(),
          armLength: z.boolean(),
          irrevocablyReserved: z.boolean(),
        })
        .strict(),
    ),
    losses: z.array(
      z
        .object({
          id: LedgerIdSchema,
          year: z.number().int().min(1).max(9999),
          original: MoneySchema,
          remaining: MoneySchema,
          enterpriseId: LedgerIdSchema,
        })
        .strict(),
    ),
    allowances: z.array(
      z
        .object({
          id: LedgerIdSchema,
          sourceId: LedgerIdSchema,
          kind: z.enum([
            'working_capital',
            'liability_reserve',
            'required_capital',
            'productive_investment',
          ]),
          addition: MoneySchema,
          target: MoneySchema,
          existingDedicated: MoneySchema,
          insuranceGrantsOtherFinance: MoneySchema,
          deadline: DateSchema,
          originalDeadline: DateSchema,
          documented: z.boolean(),
          verified: z.boolean(),
          restricted: z.boolean(),
          legallyRequiredLonger: z.boolean(),
          legalRequiredAmount: MoneySchema,
        })
        .strict(),
    ),
  })
  .strict();
export const SurplusPreparationSchema = SurplusScheduleSchema.omit({
  enterpriseId: true,
  year: true,
  terms: true,
});
export const FinancialCalculationBasisSchema = z
  .object({
    schemaVersion: z.literal(1),
    recordId: IdSchema,
    recordVersion: z.number().int().positive(),
    actorId: IdSchema,
    institutionId: IdSchema,
    calculatedAt: InstantSchema,
    noticeDate: DateSchema,
    noticeReference: z.string().min(1).max(12000),
    compactId: IdSchema,
    compactVersion: z.number().int().positive(),
    offerId: IdSchema,
    offerVersion: z.number().int().positive(),
    enterpriseId: IdSchema,
    fiscalYear: z.number().int().min(1).max(9999),
    terms: StateTermsSchema,
    scheduleDigest: z.string().regex(/^[a-f0-9]{64}$/),
    calculationDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type FinancialCalculationBasis = z.infer<typeof FinancialCalculationBasisSchema>;
export const FinancialReviewSchema = z
  .object({
    status: z.enum(['requested', 'scheduled', 'heard', 'decided']),
    basis: FinancialCalculationBasisSchema,
    requestedAt: InstantSchema,
    requestedBy: IdSchema,
    appealedVersion: z.number().int().positive(),
    requestReasons: z.string().min(1).max(12000),
    filingDeadline: DateSchema,
    disputedAmount: MoneySchema,
    undisputedAmount: MoneySchema,
    originalSchedule: SurplusPreparationSchema,
    originalCalculation: z.record(z.string(), z.unknown()),
    reviewInstitutionId: IdSchema,
    hearing: z
      .object({ date: DateSchema, noticeReference: z.string().min(1).max(12000) })
      .strict()
      .optional(),
    hearingRecord: z
      .object({
        recordedAt: InstantSchema,
        reviewerId: IdSchema,
        recordVersion: z.number().int().positive(),
        account: z.string().min(1).max(12000),
        evidence: z
          .array(
            z
              .object({
                id: IdSchema,
                plaintextSha256: z.string().regex(/^[a-f0-9]{64}$/),
                checkedAt: InstantSchema,
                checkMethod: z.literal('synthetic_text_v1'),
              })
              .strict(),
          )
          .min(1)
          .max(10),
        evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .optional(),
    decision: z
      .object({
        disposition: z.enum(['affirm', 'correct']),
        decidedAt: InstantSchema,
        reviewerId: IdSchema,
        hearingRecordVersion: z.number().int().positive(),
        reasons: z.string().min(1).max(12000),
        judicialReviewRoute: z.string().min(1).max(12000),
        evidenceIds: z.array(IdSchema).min(1),
        evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
        originalStatePayment: MoneySchema,
        reviewedStatePayment: MoneySchema,
        adjustment: z.string().regex(/^-?(0|[1-9][0-9]*)(\.[0-9]{2})$/),
        scheduleDigest: z.string().regex(/^[a-f0-9]{64}$/),
        calculationDigest: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .optional(),
  })
  .strict();
export type FinancialReview = z.infer<typeof FinancialReviewSchema>;
export const RatioSchema = z
  .object({ numerator: z.number().int().nonnegative(), denominator: z.number().int().positive() })
  .strict();
export const EvidenceLinkSchema = z
  .object({ id: IdSchema, purpose: z.string().min(1).max(200) })
  .strict();
export const ActorSchema = z
  .object({
    id: IdSchema,
    realm: RealmSchema,
    roles: z.array(RoleSchema),
    institutionId: IdSchema.nullable(),
    jurisdiction: z.string().min(2).max(80).nullable(),
    assurance: z.enum(['draft', 'verified', 'privileged']),
    assignments: z.array(IdSchema),
    conflicts: z.array(IdSchema),
    authenticationTime: InstantSchema,
  })
  .strict();
export type Actor = z.infer<typeof ActorSchema>;

export const kinds = [
  'dossier',
  'organizing_group',
  'event_petition',
  'claim',
  'hearing',
  'succession',
  'claim_survival',
  'deceased_filing',
  'association',
  'resolution',
  'opportunity',
  'state_authority',
  'objection',
  'offer',
  'round',
  'sealed_ranking',
  'draw',
  'match',
  'compact',
  'permit',
  'launch',
  'fund_commitment',
  'fund_payment',
  'financial_schedule',
  'land_acquisition',
  'supervision',
  'enforcement',
  'renewal',
  'handoff',
  'support_request',
  'privacy_request',
] as const;
export const KindSchema = z.enum(kinds);
export type Kind = z.infer<typeof KindSchema>;
export const RecordSchema = z
  .object({
    id: IdSchema,
    realm: RealmSchema,
    kind: KindSchema,
    state: z.string().max(50),
    version: z.number().int().positive(),
    ownerId: IdSchema,
    institutionId: IdSchema.nullable(),
    jurisdiction: z.string().nullable(),
    policyVersion: z.string().min(1).max(100),
    title: z.string().min(1).max(160),
    data: z.record(z.string(), z.unknown()),
    createdAt: InstantSchema,
    updatedAt: InstantSchema,
  })
  .strict();
export type CaseRecord = z.infer<typeof RecordSchema>;
export const CommandSchema = z
  .object({
    recordId: IdSchema,
    action: z.string().min(1).max(80),
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().uuid(),
    input: z.record(z.string(), z.unknown()),
  })
  .strict();
export type Command = z.infer<typeof CommandSchema>;
export const CreateRecordSchema = z
  .object({
    kind: KindSchema,
    title: z.string().trim().min(3).max(160),
    input: z.record(z.string(), z.unknown()),
    idempotencyKey: IdSchema,
  })
  .strict();
export const ReceiptSchema = z
  .object({
    id: IdSchema,
    recordId: IdSchema,
    version: z.number().int().positive(),
    acceptedAt: InstantSchema,
    action: z.string(),
    digest: z.string().length(64),
    realm: RealmSchema,
    authorityStatus: z.enum(['preparation', 'simulation', 'authorized']),
  })
  .strict();
export type Receipt = z.infer<typeof ReceiptSchema>;
export const ReceiptQuerySchema = z.object({ receiptId: IdSchema }).strict();
export const ApiErrorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    requestId: IdSchema,
    fields: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export const ResearchEventSchema = z
  .object({
    id: z.string().min(1).max(100),
    title: z.string().min(1).max(200),
    status: z.literal('research'),
    actionDate: DateSchema.nullable(),
    geography: z.string().max(300),
    industry: z.string().max(200),
    summary: z.string().max(4000),
    uncertainty: z.array(z.string().max(1000)),
    sources: z.array(
      z
        .object({
          title: z.string(),
          url: z.string().url(),
          sheet: z.string().optional(),
          row: z.number().int().positive().optional(),
        })
        .strict(),
    ),
    provenance: z
      .object({
        sourceHash: z.string().length(64),
        sheet: z.string(),
        row: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();
export type ResearchEvent = z.infer<typeof ResearchEventSchema>;

export function publicRecord(record: CaseRecord, approvedSummary: string) {
  // Explicit projection: evidence, identity, votes and financial schedules never spread here.
  return {
    id: record.id,
    kind: record.kind,
    state: record.state,
    version: record.version,
    title: record.title,
    policyVersion: record.policyVersion,
    summary: approvedSummary,
    updatedAt: record.updatedAt,
  };
}

/** A member planning mandate is not statutory authority or permission to operate. */
export const OpportunityPlanSchema = z
  .object({
    kind: z.literal('opportunity'),
    recordId: IdSchema,
    associationId: IdSchema,
    policyVersion: z.string().min(1).max(100),
    title: z.string().min(1).max(12000),
    trade: z.string().min(1).max(12000),
    district: z.string().min(1).max(12000),
    feasibility: z.string().min(1).max(12000),
    trainingPlan: z.string().min(1).max(12000),
    capitalPlan: z.string().min(1).max(12000),
    permitPlan: z.string().min(1).max(12000),
    voluntary: z.literal(true),
    shareWithMembers: z.literal(true),
  })
  .strict();
export type OpportunityPlan = z.infer<typeof OpportunityPlanSchema>;
export const OpportunityBindingSchema = z
  .object({
    recordId: IdSchema,
    associationId: IdSchema,
    version: z.number().int().positive(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    plan: OpportunityPlanSchema,
  })
  .strict()
  .refine(
    (b) => b.recordId === b.plan.recordId && b.associationId === b.plan.associationId,
    'A planning mandate must identify the same opportunity and association as its frozen plan',
  );
export type OpportunityBinding = z.infer<typeof OpportunityBindingSchema>;

/** Technical bounds on a published choice menu; these are not a discretionary rate setting. */
const CommercialKeySchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9 _-]{0,79}$/)
  .refine((key) => !['constructor', 'prototype', '__proto__'].includes(key), 'Reserved term name');
export const CommercialChoiceSchema = z.union([
  z.string().min(1).max(2000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const CommercialObjectSchema = z.custom<Record<string, unknown>>(
  (value) =>
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Reflect.ownKeys(value).every(
      (key) => typeof key === 'string' && !['__proto__', 'constructor', 'prototype'].includes(key),
    ),
  'Use a plain commercial-term object without reserved keys',
);
export const CommercialMenuSchema = CommercialObjectSchema.pipe(
  z
    .record(
      CommercialKeySchema,
      z
        .array(CommercialChoiceSchema)
        .min(1)
        .max(50)
        .refine(
          (values) => new Set(values.map((v) => JSON.stringify(v))).size === values.length,
          'Published choices must be distinct',
        ),
    )
    .refine((menu) => Object.keys(menu).length <= 50, 'At most 50 published commercial terms'),
);
export const CommercialTermsSchema = CommercialObjectSchema.pipe(
  z
    .record(CommercialKeySchema, CommercialChoiceSchema)
    .refine((terms) => Object.keys(terms).length <= 50, 'At most 50 selected commercial terms'),
);
export const CompactPlanSchema = z
  .object({
    kind: z.literal('compact'),
    recordId: IdSchema,
    associationId: IdSchema,
    offerId: IdSchema,
    matchId: IdSchema,
    policyVersion: z.string().min(1).max(100),
    title: z.string().min(1).max(160),
    terms: CommercialTermsSchema,
    services: z.string().min(1).max(12000),
    launchMilestones: z.string().min(1).max(12000),
    publicProtections: z.string().min(1).max(12000),
    initialYears: z.literal(30),
    renewalYears: z.literal(10),
    renewalLimit: z.literal(1),
    investorRights: InvestorRightsSchema.refine(
      (rights) => !Object.values(rights).some(Boolean),
      'Outside capital cannot acquire beneficiary governance or compact control',
    ),
    offer: z
      .object({
        id: IdSchema,
        version: z.number().int().positive(),
        digest: z.string().regex(/^[a-f0-9]{64}$/),
        title: z.string().min(1).max(160),
        trade: z.string().min(1).max(12000),
        district: z.string().min(1).max(12000),
        financialTerms: StateTermsSchema,
        commercialMenu: CommercialMenuSchema,
      })
      .strict(),
    match: z
      .object({ id: IdSchema, roundId: IdSchema, version: z.number().int().positive() })
      .strict(),
  })
  .strict()
  .refine(
    (p) => p.offer.id === p.offerId && p.match.id === p.matchId,
    'The frozen compact must use the same offer and match',
  );
export type CompactPlan = z.infer<typeof CompactPlanSchema>;
export const CompactBindingSchema = z
  .object({
    recordId: IdSchema,
    associationId: IdSchema,
    version: z.number().int().positive(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    plan: CompactPlanSchema,
  })
  .strict()
  .refine(
    (b) => b.recordId === b.plan.recordId && b.associationId === b.plan.associationId,
    'The compact approval must identify the same record and association',
  );
export type CompactBinding = z.infer<typeof CompactBindingSchema>;

export const CompactApprovalSchema = z
  .object({
    resolutionId: IdSchema,
    resolutionVersion: z.number().int().positive(),
    resolutionDigest: z.string().regex(/^[a-f0-9]{64}$/),
    associationId: IdSchema,
    binding: CompactBindingSchema,
    unitCount: z.number().int().positive(),
    yes: z.number().int().nonnegative(),
    no: z.number().int().nonnegative(),
    abstain: z.number().int().nonnegative(),
    notCast: z.number().int().nonnegative(),
    rollDigest: z.string().regex(/^[a-f0-9]{64}$/),
    source: z.literal('verified-terminal-tally-at-submission'),
  })
  .strict()
  .refine(
    (a) =>
      a.associationId === a.binding.associationId &&
      a.yes + a.no + a.abstain + a.notCast === a.unitCount &&
      a.yes * 2 > a.unitCount,
    'The unchanged compact requires a verified majority of all frozen units',
  );
