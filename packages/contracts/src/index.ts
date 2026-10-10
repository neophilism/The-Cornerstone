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
export const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  }, 'Use a valid calendar date');
export const MoneySchema = z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{2})?$/);
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
