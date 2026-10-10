CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE actors (
  id uuid PRIMARY KEY, realm text NOT NULL CHECK (realm IN ('proposal','simulation','program')),
  issuer text NOT NULL, subject text NOT NULL, roles text[] NOT NULL DEFAULT '{participant}',
  institution_id uuid, jurisdiction text, assurance text NOT NULL DEFAULT 'draft',
  assignments uuid[] NOT NULL DEFAULT '{}', conflicts uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(realm,issuer,subject)
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY, actor_id uuid NOT NULL REFERENCES actors,
  csrf_hash text NOT NULL, authenticated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL, revoked_at timestamptz,
  CHECK (expires_at > authenticated_at)
);
CREATE TABLE case_records (
  id uuid PRIMARY KEY, realm text NOT NULL CHECK (realm IN ('proposal','simulation','program')),
  kind text NOT NULL, state text NOT NULL, version integer NOT NULL CHECK (version > 0),
  owner_id uuid NOT NULL REFERENCES actors, institution_id uuid, jurisdiction text,
  policy_version text NOT NULL, payload_cipher jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE grants (
  id uuid PRIMARY KEY, realm text NOT NULL, record_id uuid NOT NULL REFERENCES case_records,
  owner_id uuid NOT NULL REFERENCES actors, subject_id uuid NOT NULL REFERENCES actors,
  permissions text[] NOT NULL, expires_at timestamptz NOT NULL,
  revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(permissions)>0)
);
CREATE TABLE case_versions (
  record_id uuid NOT NULL REFERENCES case_records, version integer NOT NULL,
  realm text NOT NULL, state text NOT NULL, payload_cipher jsonb NOT NULL,
  actor_id uuid NOT NULL REFERENCES actors, action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(record_id,version)
);
CREATE TABLE receipts (
  id uuid PRIMARY KEY, realm text NOT NULL, actor_id uuid NOT NULL REFERENCES actors,
  record_id uuid NOT NULL REFERENCES case_records, version integer NOT NULL,
  action text NOT NULL, digest text NOT NULL, idempotency_key uuid NOT NULL,
  request_digest text NOT NULL, accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(realm,actor_id,idempotency_key)
);
CREATE TABLE audit_events (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, realm text NOT NULL,
  actor_id uuid NOT NULL, record_id uuid, action text NOT NULL,
  record_version integer, receipt_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE outbox (
  id uuid PRIMARY KEY, realm text NOT NULL, record_id uuid NOT NULL REFERENCES case_records,
  receipt_id uuid NOT NULL REFERENCES receipts, event_type text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','leased','delivered','failed')),
  attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
  leased_until timestamptz, error_code text, UNIQUE(receipt_id,event_type)
);
CREATE TABLE authority_records (
  id uuid PRIMARY KEY, jurisdiction text NOT NULL, function text NOT NULL,
  policy_version text NOT NULL, evidence_cipher jsonb NOT NULL,
  effective_from timestamptz NOT NULL, effective_until timestamptz,
  withdrawn_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE evidence_objects (
  id uuid PRIMARY KEY, realm text NOT NULL, record_id uuid NOT NULL REFERENCES case_records,
  owner_id uuid NOT NULL REFERENCES actors, opaque_locator text UNIQUE NOT NULL,
  metadata_cipher jsonb NOT NULL, ciphertext_hash text NOT NULL,
  byte_length bigint NOT NULL CHECK(byte_length>=0 AND byte_length<=26214400),
  state text NOT NULL CHECK(state IN ('quarantined','scanning','clean','rejected')),
  hold boolean NOT NULL DEFAULT false, expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE published_records (
  id uuid PRIMARY KEY, source_record_id uuid, source_version integer,
  category text NOT NULL, projection jsonb NOT NULL,
  approved_by uuid NOT NULL, published_at timestamptz NOT NULL DEFAULT now(),
  supersedes uuid REFERENCES published_records
);
CREATE TABLE research_events (
  id text PRIMARY KEY, status text NOT NULL DEFAULT 'research' CHECK(status='research'),
  projection jsonb NOT NULL, source_hash text NOT NULL, sheet text NOT NULL,
  row_number integer NOT NULL CHECK(row_number>0), imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_hash,sheet,row_number)
);
CREATE TABLE districts (
  id uuid PRIMARY KEY, offer_id uuid NOT NULL REFERENCES case_records,
  jurisdiction text NOT NULL, boundary geometry(MultiPolygon,4326) NOT NULL,
  provenance_hash text NOT NULL, CHECK(ST_IsValid(boundary))
);
CREATE TABLE founding_units (
  id uuid PRIMARY KEY, realm text NOT NULL, association_id uuid NOT NULL REFERENCES case_records,
  claim_id uuid NOT NULL REFERENCES case_records, person_id uuid NOT NULL REFERENCES actors,
  successor_id uuid REFERENCES actors, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(association_id,person_id)
);
CREATE UNIQUE INDEX one_active_roll ON founding_units(claim_id) WHERE active;
CREATE TABLE ballots (
  id uuid PRIMARY KEY, realm text NOT NULL, resolution_id uuid NOT NULL REFERENCES case_records,
  unit_id uuid NOT NULL REFERENCES founding_units, choice_cipher jsonb NOT NULL,
  receipt_id uuid NOT NULL UNIQUE REFERENCES receipts,
  UNIQUE(resolution_id,unit_id)
);
CREATE TABLE active_matches (
  association_id uuid PRIMARY KEY REFERENCES case_records,
  offer_id uuid NOT NULL UNIQUE REFERENCES case_records,
  match_id uuid NOT NULL UNIQUE REFERENCES case_records
);
CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY, realm text NOT NULL, account_id uuid NOT NULL,
  record_id uuid NOT NULL REFERENCES case_records,
  entry_kind text NOT NULL, cents numeric(30,0) NOT NULL,
  source_id text NOT NULL, receipt_id uuid NOT NULL REFERENCES receipts,
  reverses uuid UNIQUE REFERENCES ledger_entries, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id,source_id,entry_kind)
);
CREATE INDEX records_owner ON case_records(realm,owner_id,updated_at DESC);
CREATE INDEX records_institution ON case_records(realm,institution_id);
CREATE INDEX grants_scope ON grants(record_id,subject_id) WHERE revoked_at IS NULL;
CREATE INDEX outbox_pending ON outbox(available_at) WHERE state IN ('pending','failed');
CREATE INDEX district_geometry ON districts USING gist(boundary);

CREATE FUNCTION context_subject() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.subject',true),'')::uuid $$;
CREATE FUNCTION context_realm() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.realm',true),'') $$;
CREATE FUNCTION readable_record(record uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
SELECT EXISTS(SELECT 1 FROM case_records c WHERE c.id=record AND c.realm=context_realm() AND (
 c.owner_id=context_subject() OR EXISTS(SELECT 1 FROM grants g WHERE g.record_id=c.id AND g.subject_id=context_subject() AND g.revoked_at IS NULL AND g.expires_at>now() AND 'read'=ANY(g.permissions)) OR EXISTS(SELECT 1 FROM actors a WHERE a.id=context_subject() AND a.realm=c.realm AND a.assurance='privileged' AND a.institution_id=c.institution_id AND c.id=ANY(a.assignments) AND NOT c.id=ANY(a.conflicts) AND a.roles && ARRAY['labor','commerce','state','supervisor','adjudicator','fiscal','auditor','support']::text[]))) $$;

ALTER TABLE case_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_records FORCE ROW LEVEL SECURITY;
CREATE POLICY record_read ON case_records FOR SELECT USING (readable_record(id));
CREATE POLICY record_insert ON case_records FOR INSERT WITH CHECK(realm=context_realm() AND owner_id=context_subject());
CREATE POLICY record_update ON case_records FOR UPDATE USING(readable_record(id)) WITH CHECK(realm=context_realm());
ALTER TABLE grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE grants FORCE ROW LEVEL SECURITY;
CREATE POLICY grant_read ON grants FOR SELECT USING(realm=context_realm() AND (owner_id=context_subject() OR subject_id=context_subject()));
CREATE POLICY grant_insert ON grants FOR INSERT WITH CHECK(realm=context_realm() AND owner_id=context_subject() AND EXISTS(SELECT 1 FROM case_records c WHERE c.id=record_id AND c.owner_id=context_subject() AND c.realm=context_realm()));
CREATE POLICY grant_update ON grants FOR UPDATE USING(realm=context_realm() AND owner_id=context_subject()) WITH CHECK(realm=context_realm() AND owner_id=context_subject());
ALTER TABLE case_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY versions_read ON case_versions FOR SELECT USING(realm=context_realm() AND readable_record(record_id));
CREATE POLICY versions_insert ON case_versions FOR INSERT WITH CHECK(realm=context_realm() AND readable_record(record_id));
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY receipt_read ON receipts FOR SELECT USING(realm=context_realm() AND (actor_id=context_subject() OR readable_record(record_id)));
CREATE POLICY receipt_insert ON receipts FOR INSERT WITH CHECK(realm=context_realm() AND actor_id=context_subject());
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON audit_events FOR SELECT USING(realm=context_realm() AND readable_record(record_id));
CREATE POLICY audit_insert ON audit_events FOR INSERT WITH CHECK(realm=context_realm() AND actor_id=context_subject());
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_insert ON outbox FOR INSERT WITH CHECK(realm=context_realm() AND readable_record(record_id));
ALTER TABLE evidence_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_objects FORCE ROW LEVEL SECURITY;
CREATE POLICY evidence_read ON evidence_objects FOR SELECT USING(realm=context_realm() AND readable_record(record_id));
CREATE POLICY evidence_insert ON evidence_objects FOR INSERT WITH CHECK(realm=context_realm() AND owner_id=context_subject() AND readable_record(record_id));
ALTER TABLE founding_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE founding_units FORCE ROW LEVEL SECURITY;
CREATE POLICY units_read ON founding_units FOR SELECT USING(realm=context_realm() AND (person_id=context_subject() OR successor_id=context_subject() OR readable_record(association_id)));
ALTER TABLE ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ballots FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY ledger_read ON ledger_entries FOR SELECT USING(realm=context_realm() AND readable_record(record_id));

CREATE FUNCTION immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Append-only record: correction requires a new version'; END $$;
CREATE TRIGGER immutable_versions BEFORE UPDATE OR DELETE ON case_versions FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_receipts BEFORE UPDATE OR DELETE ON receipts FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_ledgers BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION immutable_record();

CREATE FUNCTION auth_lookup(token text) RETURNS TABLE(actor jsonb,csrf_hash text) LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
SELECT jsonb_build_object('id',a.id,'realm',a.realm,'roles',a.roles,'institutionId',a.institution_id,'jurisdiction',a.jurisdiction,'assurance',a.assurance,'assignments',a.assignments,'conflicts',a.conflicts,'authenticationTime',to_char(s.authenticated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),s.csrf_hash
FROM sessions s JOIN actors a ON a.id=s.actor_id WHERE s.token_hash=token AND s.expires_at>now() AND s.revoked_at IS NULL $$;
CREATE FUNCTION auth_bind(realm_in text,issuer_in text,subject_in text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid; BEGIN
IF realm_in NOT IN ('proposal','simulation') OR length(issuer_in)>500 OR length(subject_in)>300 THEN RAISE EXCEPTION 'Invalid draft identity binding'; END IF;
INSERT INTO actors(id,realm,issuer,subject) VALUES(gen_random_uuid(),realm_in,issuer_in,subject_in) ON CONFLICT(realm,issuer,subject) DO NOTHING;
SELECT id INTO result FROM actors WHERE realm=realm_in AND issuer=issuer_in AND subject=subject_in; RETURN result; END $$;
CREATE FUNCTION auth_session(actor_in uuid,token_in text,csrf_in text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
INSERT INTO sessions(token_hash,actor_id,csrf_hash,authenticated_at,expires_at) SELECT token_in,actor_in,csrf_in,now(),now()+interval '8 hours' WHERE EXISTS(SELECT 1 FROM actors WHERE id=actor_in AND realm IN ('proposal','simulation')) $$;
CREATE FUNCTION auth_logout(token_in text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ UPDATE sessions SET revoked_at=now() WHERE token_hash=token_in $$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO cornerstone_runtime;
GRANT SELECT,INSERT,UPDATE ON case_records,grants TO cornerstone_runtime;
GRANT SELECT,INSERT ON case_versions,receipts,audit_events TO cornerstone_runtime;
GRANT INSERT ON outbox,evidence_objects TO cornerstone_runtime;
GRANT SELECT ON evidence_objects,founding_units,ledger_entries,research_events,published_records TO cornerstone_runtime;
GRANT USAGE,SELECT ON SEQUENCE audit_events_sequence_seq TO cornerstone_runtime;
GRANT EXECUTE ON FUNCTION context_subject(),context_realm(),readable_record(uuid),auth_lookup(text),auth_bind(text,text,text),auth_session(uuid,text,text),auth_logout(text) TO cornerstone_runtime;
