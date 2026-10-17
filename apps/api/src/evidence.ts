import { randomUUID, createHash } from 'node:crypto';
import {
  EvidenceMetadataSchema,
  EvidenceViewSchema,
  EvidencePageSchema,
  UploadSyntheticEvidenceSchema,
  ValidateSyntheticEvidenceSchema,
  MAX_SYNTHETIC_EVIDENCE_BYTES,
  MAX_SYNTHETIC_ATTACHMENTS,
  type Actor,
  type CaseRecord,
  type Mode,
  type Realm,
} from '@cornerstone/contracts';
import {
  DomainError,
  requireCondition,
  evidencePreparationRoles,
  evidencePreparationStanding,
} from '@cornerstone/domain';
import { canAct, digest, type Envelope } from '@cornerstone/security';
import { Store, type Transaction } from '@cornerstone/store';

const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex');
export function validateSyntheticText(bytes: Uint8Array): boolean {
  if (!bytes.length || bytes.length > MAX_SYNTHETIC_EVIDENCE_BYTES) return false;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text);
  } catch {
    return false;
  }
}
const metaBinding = (r: string, id: string) =>
  'cornerstone:evidence-meta:simulation:' + r + ':' + id;
const bodyBinding = (r: string, id: string) =>
  'cornerstone:evidence-body:simulation:' + r + ':' + id;
export class EvidenceService {
  constructor(
    readonly store: Store,
    readonly mode: Mode,
    readonly realm: Realm,
    readonly provider: string,
  ) {}
  get enabled() {
    return (
      this.mode === 'simulation' &&
      this.realm === 'simulation' &&
      this.provider === 'synthetic-postgres'
    );
  }
  private writable(actor: Actor) {
    requireCondition(
      this.enabled && actor.realm === this.realm,
      'EVIDENCE_DISABLED',
      'The bounded synthetic evidence adapter is not enabled. Real evidence intake is closed.',
    );
  }
  private async record(tx: Transaction, actor: Actor, id: string, write = false) {
    const record = await this.store.get(tx, id, write);
    if (!record) throw new DomainError('NOT_FOUND', 'Record not found.', 404);
    if (write) {
      const roles = evidencePreparationRoles(record);
      requireCondition(
        roles.length > 0,
        'EVIDENCE_STAGE',
        'Attachments are open only for ordinary drafts or financial appeals before the hearing record closes.',
      );
      const grants = await this.store.grants(tx, id);
      requireCondition(
        evidencePreparationStanding(actor, record) &&
          canAct(actor, record, roles, grants, 'attach_evidence', new Date().toISOString()),
        'RECORD_PERMISSION',
        'Current record attachment permission is required.',
      );
      if (record.kind === 'financial_schedule' && record.state !== 'draft') {
        const currentScope = await tx.query(
          'SELECT simulation_financial_evidence_writer($1) AS allowed',
          [record.id],
        );
        requireCondition(
          currentScope.rows[0]?.allowed === true,
          'RECORD_PERMISSION',
          'Current member ownership or independent adjudicator standing is required for hearing evidence.',
        );
      }
    }
    return record;
  }
  private view(row: pgRow) {
    const metadata = EvidenceMetadataSchema.parse(
      this.store.open(row.metadata_cipher, metaBinding(row.record_id, row.id)),
    );
    return EvidenceViewSchema.parse({
      ...metadata,
      id: row.id,
      recordId: row.record_id,
      uploaderId: row.owner_id,
      byteLength: Number(row.byte_length),
      state: row.state,
      createdAt: row.created_at.toISOString(),
      checkedAt: row.checked_at?.toISOString() ?? null,
      checkMethod: row.check_method,
      rejectionCode: row.rejection_code,
      mediaType: 'text/plain',
      realm: row.realm,
      classification: 'synthetic_evidence',
      securityScan: 'not_performed',
      legalAcceptance: false,
    });
  }
  async list(actor: Actor, id: string) {
    return this.store.transaction(actor, async (tx) => {
      const record = await this.record(tx, actor, id);
      const rows = await tx.query(
        'SELECT * FROM evidence_objects WHERE record_id=$1 ORDER BY created_at,id LIMIT 10',
        [id],
      );
      return EvidencePageSchema.parse({
        context: { actorId: actor.id, realm: actor.realm },
        recordId: record.id,
        version: record.version,
        enabled: this.enabled,
        evidence: rows.rows.map((row) => this.view(row)),
      });
    });
  }
  private async save(
    tx: Transaction,
    actor: Actor,
    record: CaseRecord,
    input: { idempotencyKey: string },
    request: string,
    action: string,
    detail: Record<string, unknown>,
    evidenceId?: string,
  ) {
    const history = Array.isArray(record.data['history']) ? record.data['history'] : [],
      now = new Date().toISOString();
    const ids = Array.isArray(record.data['evidenceIds']) ? record.data['evidenceIds'] : [];
    const next = {
      ...record,
      version: record.version + 1,
      updatedAt: now,
      data: {
        ...record.data,
        ...(evidenceId ? { evidenceIds: [...ids, evidenceId] } : {}),
        history: [
          ...history,
          { version: record.version + 1, action, at: now, actorId: actor.id, ...detail },
        ],
      },
    };
    const receipt = await this.store.save(tx, actor, next, action, input.idempotencyKey, request);
    return { record: next, receipt };
  }
  private async replay(
    tx: Transaction,
    actor: Actor,
    receipt: import('@cornerstone/contracts').Receipt,
  ) {
    await this.record(tx, actor, receipt.recordId);
    const record = await this.store.getVersion(tx, receipt.recordId, receipt.version);
    if (!record)
      throw new DomainError('NOT_FOUND', 'Record not found or no longer accessible.', 404);
    return { receipt, record };
  }
  async upload(actor: Actor, raw: unknown) {
    this.writable(actor);
    const input = UploadSyntheticEvidenceSchema.parse(raw);
    const bytes = Buffer.from(input.base64, 'base64');
    requireCondition(
      bytes.length > 0 &&
        bytes.length <= MAX_SYNTHETIC_EVIDENCE_BYTES &&
        bytes.toString('base64') === input.base64,
      'EVIDENCE_SIZE',
      'Use a nonempty canonical attachment of at most 256 KiB.',
    );
    const request = digest({ action: 'upload_synthetic_evidence', ...input });
    return this.store.transaction(actor, async (tx) => {
      const previous = await this.store.existingReceipt(tx, actor, input.idempotencyKey, request);
      if (previous) return this.replay(tx, actor, previous);
      const record = await this.record(tx, actor, input.recordId, true);
      requireCondition(
        record.version === input.expectedVersion,
        'STALE_VERSION',
        'This record changed. Reload before attaching evidence.',
      );
      const count = await tx.query(
        'SELECT count(*)::int n FROM evidence_objects WHERE record_id=$1',
        [record.id],
      );
      requireCondition(
        typeof count.rows[0]?.n === 'number' && count.rows[0].n < MAX_SYNTHETIC_ATTACHMENTS,
        'EVIDENCE_LIMIT',
        'At most ten synthetic attachments are allowed on a record.',
      );
      const id = randomUUID(),
        hash = sha256(bytes),
        metadata = EvidenceMetadataSchema.parse({
          filename: input.filename,
          description: input.description,
          plaintextSha256: hash,
          ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
          ...(input.sourceDate ? { sourceDate: input.sourceDate } : {}),
        });
      const body = this.store.seal({ base64: input.base64 }, bodyBinding(record.id, id)),
        metadataCipher = this.store.seal(metadata, metaBinding(record.id, id));
      const cipherHash = sha256(Buffer.from(body.ciphertext, 'base64'));
      await tx.query(
        'INSERT INTO evidence_objects(id,realm,record_id,owner_id,opaque_locator,metadata_cipher,ciphertext_hash,byte_length,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          id,
          'simulation',
          record.id,
          actor.id,
          'synthetic-postgres:' + id,
          JSON.stringify(metadataCipher),
          cipherHash,
          bytes.length,
          'quarantined',
        ],
      );
      await tx.query(
        'INSERT INTO evidence_bodies(evidence_id,realm,record_id,body_cipher) VALUES($1,$2,$3,$4)',
        [id, 'simulation', record.id, JSON.stringify(body)],
      );
      return this.save(
        tx,
        actor,
        record,
        input,
        request,
        'upload_synthetic_evidence',
        { evidenceId: id, plaintextSha256: hash },
        id,
      );
    });
  }
  private bytes(row: pgRow): Buffer {
    const envelope = row.body_cipher as Envelope;
    requireCondition(
      sha256(Buffer.from(envelope.ciphertext, 'base64')) === row.ciphertext_hash,
      'EVIDENCE_INTEGRITY',
      'The saved attachment could not be verified.',
    );
    const body = this.store.open<{ base64: string }>(envelope, bodyBinding(row.record_id, row.id));
    const bytes = Buffer.from(body.base64, 'base64'),
      metadata = EvidenceMetadataSchema.parse(
        this.store.open(row.metadata_cipher, metaBinding(row.record_id, row.id)),
      );
    requireCondition(
      bytes.length === Number(row.byte_length) && sha256(bytes) === metadata.plaintextSha256,
      'EVIDENCE_INTEGRITY',
      'The saved attachment could not be verified.',
    );
    return bytes;
  }
  async assertAvailable(tx: Transaction, recordId: string, ids: string[]) {
    const result = await tx.query(
      "SELECT e.*,b.body_cipher FROM evidence_objects e JOIN evidence_bodies b ON b.evidence_id=e.id WHERE e.id=ANY($1::uuid[]) AND e.record_id=$2 AND e.state='clean' AND e.check_method='synthetic_text_v1'",
      [ids, recordId],
    );
    requireCondition(
      new Set(ids).size === ids.length && result.rowCount === ids.length,
      'EVIDENCE_UNAVAILABLE',
      'Each listed evidence item must be available, unique and attached to this record. Text validation does not prove a claim.',
    );
    try {
      for (const row of result.rows)
        requireCondition(
          validateSyntheticText(this.bytes(row)),
          'EVIDENCE_INTEGRITY',
          'Attachment verification failed.',
        );
    } catch {
      throw new DomainError(
        'EVIDENCE_INTEGRITY',
        'A listed attachment could not be verified.',
        409,
      );
    }
    return result.rows
      .map((row) => {
        const metadata = this.view(row);
        return {
          id: metadata.id,
          plaintextSha256: metadata.plaintextSha256,
          checkedAt: metadata.checkedAt!,
          checkMethod: 'synthetic_text_v1' as const,
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  async validate(actor: Actor, raw: unknown) {
    this.writable(actor);
    const input = ValidateSyntheticEvidenceSchema.parse(raw),
      request = digest({ action: 'validate_synthetic_evidence', ...input });
    return this.store.transaction(actor, async (tx) => {
      const previous = await this.store.existingReceipt(tx, actor, input.idempotencyKey, request);
      if (previous) return this.replay(tx, actor, previous);
      const record = await this.record(tx, actor, input.recordId, true);
      requireCondition(
        record.version === input.expectedVersion,
        'STALE_VERSION',
        'This record changed. Reload before validation.',
      );
      const found = await tx.query(
        'SELECT e.*,b.body_cipher FROM evidence_objects e JOIN evidence_bodies b ON b.evidence_id=e.id WHERE e.id=$1 AND e.record_id=$2 FOR UPDATE OF e',
        [input.evidenceId, record.id],
      );
      const row = found.rows[0];
      if (!row) throw new DomainError('NOT_FOUND', 'Attachment not found.', 404);
      requireCondition(
        row.owner_id === actor.id || record.ownerId === actor.id,
        'RECORD_PERMISSION',
        'Only the uploader or record owner may validate this attachment.',
      );
      requireCondition(
        row.state === 'quarantined',
        'EVIDENCE_ALREADY_CHECKED',
        'This immutable attachment was already checked.',
      );
      let code: string | null = null;
      try {
        if (!validateSyntheticText(this.bytes(row))) code = 'INVALID_TEXT';
      } catch {
        code = 'INTEGRITY';
      }
      await tx.query(
        "UPDATE evidence_objects SET state=$2,checked_at=now(),check_method='synthetic_text_v1',rejection_code=$3 WHERE id=$1",
        [row.id, code ? 'rejected' : 'clean', code],
      );
      return this.save(tx, actor, record, input, request, 'validate_synthetic_evidence', {
        evidenceId: row.id,
        result: code ? 'rejected' : 'synthetic_text_checked',
        rejectionCode: code,
      });
    });
  }
  async download(actor: Actor, id: string) {
    return this.store.transaction(actor, async (tx) => {
      const result = await tx.query(
          'SELECT e.*,b.body_cipher FROM evidence_objects e JOIN evidence_bodies b ON b.evidence_id=e.id WHERE e.id=$1',
          [id],
        ),
        row = result.rows[0];
      if (!row) throw new DomainError('NOT_FOUND', 'Attachment not found.', 404);
      requireCondition(
        row.state === 'clean' && row.check_method === 'synthetic_text_v1',
        'EVIDENCE_QUARANTINED',
        'This attachment is not available for download.',
      );
      let bytes: Buffer;
      try {
        bytes = this.bytes(row);
        requireCondition(
          validateSyntheticText(bytes),
          'EVIDENCE_INTEGRITY',
          'The saved attachment could not be verified.',
        );
      } catch {
        throw new DomainError(
          'EVIDENCE_INTEGRITY',
          'The saved attachment could not be verified.',
          409,
        );
      }
      const view = this.view(row);
      return { bytes, filename: view.filename };
    });
  }
}
type pgRow = Record<string, any>;
