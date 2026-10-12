import pg from 'pg';
import { randomUUID } from 'node:crypto';

export class ActivityWorker {
  readonly pool: pg.Pool;
  readonly id = randomUUID();
  constructor(url: string) {
    this.pool = new pg.Pool({
      connectionString: url,
      max: 2,
      connectionTimeoutMillis: 10000,
      statement_timeout: 10000,
      query_timeout: 12000,
      application_name: 'cornerstone-activity-worker',
    });
  }
  async verifyRole() {
    const role = await this.pool.query(
      'SELECT current_user AS name,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user',
    );
    const r = role.rows[0];
    if (
      !r ||
      r.name !== 'cornerstone_worker' ||
      r.rolsuper ||
      r.rolbypassrls ||
      r.rolcreatedb ||
      r.rolcreaterole
    )
      throw Error('Restricted cornerstone_worker credentials required.');
    const privileges = await this.pool.query(
      "SELECT has_table_privilege(current_user,'case_records','SELECT') AS cases,has_table_privilege(current_user,'sessions','SELECT') AS sessions,has_table_privilege(current_user,'evidence_objects','SELECT') AS evidence",
    );
    if (Object.values(privileges.rows[0] ?? {}).some(Boolean))
      throw Error('Activity worker must not read private records, sessions or evidence.');
  }
  async once(batch = 25, signal?: AbortSignal) {
    if (signal?.aborted) return { leased: 0, delivered: 0 };
    const jobs = await this.pool.query('SELECT * FROM lease_activity_events($1,$2)', [
      this.id,
      batch,
    ]);
    let delivered = 0;
    for (const job of jobs.rows) {
      // Stop before another delivery, but let an already-started transaction settle.
      if (signal?.aborted) break;
      try {
        await this.pool.query('SELECT deliver_activity_event($1,$2)', [job.event_id, job.token]);
        delivered++;
      } catch {
        // Unstarted/rejected work retains its lease for recovery instead of doing more SQL during drain.
        if (signal?.aborted) break;
        // Do not export exceptions: provider/SQL errors can contain private inputs.
        try {
          await this.pool.query('SELECT fail_activity_event($1,$2,$3)', [
            job.event_id,
            job.token,
            'DELIVERY_ERROR',
          ]);
        } catch {
          /* lease lost; its successor owns recovery */
        }
      }
    }
    return { leased: jobs.rows.length, delivered };
  }
  async close() {
    await this.pool.end();
  }
}
