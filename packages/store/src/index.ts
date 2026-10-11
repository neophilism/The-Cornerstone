import pg from 'pg';
import {
  ActivityNotificationSchema,
  RecordPageQuerySchema,
  RecordCursorSchema,
  type Actor,
  type CaseRecord,
  type Receipt,
} from '@cornerstone/contracts';
import { encrypt, decrypt, digest, type Envelope } from '@cornerstone/security';
import { randomUUID } from 'node:crypto';

export class PersistenceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = 'PersistenceError';
  }
}

export type Transaction = {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<T>>;
};
type Row = {
  id: string;
  realm: CaseRecord['realm'];
  kind: CaseRecord['kind'];
  state: string;
  version: number;
  owner_id: string;
  institution_id: string | null;
  jurisdiction: string | null;
  policy_version: string;
  payload_cipher: Envelope;
  created_at: Date;
  updated_at: Date;
};
export class Store {
  readonly pool: pg.Pool;
  constructor(
    url: string,
    private readonly key: Buffer,
  ) {
    this.pool = new pg.Pool({
      connectionString: url,
      max: 8,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      application_name: 'cornerstone-runtime',
    });
  }
  async verifyRole() {
    const r = await this.pool.query(
      'SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user',
    );
    if (!r.rows[0] || Object.values(r.rows[0]).some(Boolean))
      throw new Error('Runtime database role must not bypass RLS or administer roles/databases.');
    const owner = await this.pool.query(
      "SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='case_records' AND tableowner=current_user",
    );
    if (owner.rowCount) throw new Error('Runtime database role must not own case tables.');
  }
  async transaction<T>(actor: Actor, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "SELECT set_config('app.subject',$1,true),set_config('app.realm',$2,true)",
        [actor.id, actor.realm],
      );
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  decode(row: Row): CaseRecord {
    const privateData = decrypt<{
      title: string;
      data: Record<string, unknown>;
      metadata?: {
        institutionId: string | null;
        jurisdiction: string | null;
        policyVersion: string;
        createdAt: string;
        updatedAt: string;
      };
    }>(row.payload_cipher, this.key, `cornerstone:record:${row.id}:${row.version}`);
    return {
      id: row.id,
      realm: row.realm,
      kind: row.kind,
      state: row.state,
      version: row.version,
      ownerId: row.owner_id,
      institutionId: row.institution_id,
      jurisdiction: row.jurisdiction,
      policyVersion: row.policy_version,
      title: privateData.title,
      data: privateData.data,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      ...privateData.metadata,
    };
  }
  seal(value: unknown, binding: string): Envelope {
    return encrypt(value, this.key, 'development-field-v1', binding);
  }
  open<T>(envelope: Envelope, binding: string): T {
    return decrypt<T>(envelope, this.key, binding);
  }
  async get(tx: Transaction, id: string, lock = false) {
    const r = await tx.query<Row>(
      `SELECT * FROM case_records WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`,
      [id],
    );
    return r.rows[0] ? this.decode(r.rows[0]) : null;
  }
  async list(actor: Actor) {
    return (await this.listPage(actor)).records;
  }
  async listPage(actor: Actor, input: unknown = {}) {
    const query = RecordPageQuerySchema.parse(input);
    const binding = `cornerstone:record-page:${actor.realm}:${actor.id}`;
    let before: { id: string; updatedAt: string } | undefined;
    if (query.cursor) {
      try {
        before = RecordCursorSchema.parse(
          this.open(JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')), binding),
        );
      } catch {
        throw new PersistenceError(
          'INVALID_CURSOR',
          'This record page is unavailable. Refresh your records to continue.',
          400,
        );
      }
    }
    return this.transaction(actor, async (tx) => {
      // Preserve PostgreSQL microseconds in the boundary; JavaScript Date truncates them.
      const result = await tx.query<Row & { sort_stamp: string }>(
        `SELECT *,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS sort_stamp
         FROM case_records
         WHERE ($1::timestamptz IS NULL OR (updated_at,id)<($1::timestamptz,$2::uuid))
         ORDER BY updated_at DESC,id DESC LIMIT $3`,
        [before?.updatedAt ?? null, before?.id ?? null, query.limit + 1],
      );
      const rows = result.rows.slice(0, query.limit);
      const last = rows.at(-1);
      const nextCursor =
        result.rows.length > query.limit && last
          ? Buffer.from(
              JSON.stringify(
                this.seal({ version: 1, id: last.id, updatedAt: last.sort_stamp }, binding),
              ),
            ).toString('base64url')
          : null;
      return { records: rows.map((row) => this.decode(row)), nextCursor };
    });
  }
  async getVersion(tx: Transaction, id: string, version: number) {
    const r = await tx.query<Row>(
      'SELECT c.id,c.kind,c.owner_id,c.institution_id,c.jurisdiction,c.policy_version,c.created_at,v.realm,v.state,v.version,v.payload_cipher,v.created_at AS updated_at FROM case_records c JOIN case_versions v ON v.record_id=c.id WHERE c.id=$1 AND v.version=$2',
      [id, version],
    );
    return r.rows[0] ? this.decode(r.rows[0]) : null;
  }
  async getMany(tx: Transaction, ids: string[], lock = false) {
    const result = await tx.query<Row>(
      `SELECT * FROM case_records WHERE id=ANY($1::uuid[]) ORDER BY id${lock ? ' FOR UPDATE' : ''}`,
      [ids],
    );
    return result.rows.map((row) => this.decode(row));
  }
  async grants(tx: Transaction, id: string) {
    return this.scopes(tx, [id]);
  }
  async scopes(tx: Transaction, ids: string[]) {
    const r = await tx.query(
      `SELECT subject_id,record_id,expires_at,revoked_at,permissions FROM grants WHERE record_id=ANY($1::uuid[])
       UNION ALL SELECT subject_id,record_id,'9999-12-31'::timestamptz,NULL::timestamptz,permissions FROM simulation_member_scopes() WHERE record_id=ANY($1::uuid[])`,
      [ids],
    );
    return r.rows.map((g) => ({
      subjectId: g.subject_id as string,
      recordId: g.record_id as string,
      expiresAt: (g.expires_at as Date).toISOString(),
      revoked: !!g.revoked_at,
      permissions: g.permissions as string[],
    }));
  }
  async existingReceipt(
    tx: Transaction,
    actor: Actor,
    idempotencyKey: string,
    requestDigest: string,
  ) {
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `${actor.realm}:${actor.id}:${idempotencyKey}`,
    ]);
    const r = await tx.query(
      'SELECT * FROM receipts WHERE realm=$1 AND actor_id=$2 AND idempotency_key=$3',
      [actor.realm, actor.id, idempotencyKey],
    );
    if (!r.rows[0]) return null;
    if (r.rows[0].request_digest !== requestDigest)
      throw new PersistenceError(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency key already binds a different command.',
      );
    return this.receipt(r.rows[0]);
  }
  private receipt(row: pg.QueryResultRow): Receipt {
    return {
      id: row.id,
      recordId: row.record_id,
      version: row.version,
      action: row.action,
      digest: row.digest,
      acceptedAt: row.accepted_at.toISOString(),
      realm: row.realm,
      authorityStatus:
        row.realm === 'program'
          ? 'authorized'
          : row.realm === 'simulation'
            ? 'simulation'
            : 'preparation',
    };
  }
  async save(
    tx: Transaction,
    actor: Actor,
    record: CaseRecord,
    action: string,
    idempotencyKey: string,
    requestDigest: string,
    isNew = false,
  ) {
    const envelope = encrypt(
      {
        title: record.title,
        data: record.data,
        metadata: {
          institutionId: record.institutionId,
          jurisdiction: record.jurisdiction,
          policyVersion: record.policyVersion,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        },
      },
      this.key,
      'development-field-v1',
      `cornerstone:record:${record.id}:${record.version}`,
    );
    if (isNew)
      await tx.query(
        'INSERT INTO case_records(id,realm,kind,state,version,owner_id,institution_id,jurisdiction,policy_version,payload_cipher) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          record.id,
          record.realm,
          record.kind,
          record.state,
          record.version,
          record.ownerId,
          record.institutionId,
          record.jurisdiction,
          record.policyVersion,
          JSON.stringify(envelope),
        ],
      );
    else {
      const r = await tx.query(
        'UPDATE case_records SET state=$2,version=$3,payload_cipher=$4,updated_at=$5,institution_id=$6 WHERE id=$1 AND version=$7',
        [
          record.id,
          record.state,
          record.version,
          JSON.stringify(envelope),
          record.updatedAt,
          record.institutionId,
          record.version - 1,
        ],
      );
      if (r.rowCount !== 1)
        throw new PersistenceError('STALE_VERSION', 'Record changed; reload before submitting.');
    }
    await tx.query(
      'INSERT INTO case_versions(record_id,version,realm,state,payload_cipher,actor_id,action) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        record.id,
        record.version,
        record.realm,
        record.state,
        JSON.stringify(envelope),
        actor.id,
        action,
      ],
    );
    const id = randomUUID();
    const r = await tx.query(
      'INSERT INTO receipts(id,realm,actor_id,record_id,version,action,digest,idempotency_key,request_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [
        id,
        record.realm,
        actor.id,
        record.id,
        record.version,
        action,
        digest({ record, action, actorId: actor.id }),
        idempotencyKey,
        requestDigest,
      ],
    );
    await tx.query(
      'INSERT INTO audit_events(realm,actor_id,record_id,action,record_version,receipt_id) VALUES($1,$2,$3,$4,$5,$6)',
      [record.realm, actor.id, record.id, action, record.version, id],
    );
    await tx.query(
      'INSERT INTO outbox(id,realm,record_id,receipt_id,event_type) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(), record.realm, record.id, id, 'record_changed'],
    );
    return this.receipt(r.rows[0]!);
  }
  async publicResearch() {
    const r = await this.pool.query(
      'SELECT projection FROM research_events ORDER BY id LIMIT 2000',
    );
    return r.rows.map((row) => row.projection);
  }
  async publicRegister() {
    const r = await this.pool.query(
      'SELECT projection FROM published_records ORDER BY published_at DESC LIMIT 200',
    );
    return r.rows.map((row) => row.projection);
  }
  async close() {
    await this.pool.end();
  }
  async notifications(actor: Actor) {
    return this.transaction(actor, async (tx) => {
      const r = await tx.query(
        'SELECT * FROM activity_notifications ORDER BY created_at DESC,id LIMIT 100',
      );
      return r.rows.map((n) =>
        ActivityNotificationSchema.parse({
          id: n.id,
          recordId: n.record_id,
          receiptId: n.receipt_id,
          version: n.record_version,
          action: n.action,
          createdAt: n.created_at.toISOString(),
          readAt: n.read_at?.toISOString() ?? null,
          classification: 'activity',
          channel: 'in_app',
          legalService: false,
          realm: n.realm,
        }),
      );
    });
  }
  async markActivityRead(actor: Actor, ids: string[]) {
    return this.transaction(actor, async (tx) => {
      await tx.query(
        'UPDATE activity_notifications SET read_at=COALESCE(read_at,now()) WHERE id=ANY($1::uuid[])',
        [ids],
      );
    });
  }
}
