-- Bounded synthetic text adapter; no real custody/scanner/provider is enabled.
ALTER TABLE evidence_objects ADD COLUMN checked_at timestamptz,
 ADD COLUMN check_method text CHECK(check_method IS NULL OR check_method='synthetic_text_v1'),
 ADD COLUMN rejection_code text CHECK(rejection_code IS NULL OR rejection_code IN ('INVALID_TEXT','INTEGRITY'));
ALTER TABLE evidence_objects ADD CONSTRAINT evidence_identity UNIQUE(id,realm,record_id);
CREATE TABLE evidence_bodies (
 evidence_id uuid PRIMARY KEY, realm text NOT NULL CHECK(realm='simulation'),
 record_id uuid NOT NULL, body_cipher jsonb NOT NULL CHECK(octet_length(body_cipher::text)<=500000),
 FOREIGN KEY(evidence_id,realm,record_id) REFERENCES evidence_objects(id,realm,record_id)
);
ALTER TABLE evidence_bodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_bodies FORCE ROW LEVEL SECURITY;
CREATE POLICY evidence_body_read ON evidence_bodies FOR SELECT USING(realm=context_realm() AND readable_record(record_id));
CREATE POLICY evidence_body_insert ON evidence_bodies FOR INSERT WITH CHECK(realm=context_realm() AND readable_record(record_id) AND EXISTS(SELECT 1 FROM evidence_objects e WHERE e.id=evidence_id AND e.owner_id=context_subject()));
CREATE POLICY evidence_check ON evidence_objects FOR UPDATE USING(
 realm='simulation' AND realm=context_realm() AND readable_record(record_id)
 AND (owner_id=context_subject() OR EXISTS(SELECT 1 FROM case_records c WHERE c.id=record_id AND c.owner_id=context_subject()))
) WITH CHECK(realm='simulation' AND realm=context_realm() AND readable_record(record_id));
CREATE TRIGGER immutable_evidence_body BEFORE UPDATE OR DELETE ON evidence_bodies FOR EACH ROW EXECUTE FUNCTION immutable_record();
REVOKE ALL ON evidence_bodies FROM PUBLIC;
GRANT SELECT,INSERT ON evidence_bodies TO cornerstone_runtime;
GRANT UPDATE(state,checked_at,check_method,rejection_code) ON evidence_objects TO cornerstone_runtime;
