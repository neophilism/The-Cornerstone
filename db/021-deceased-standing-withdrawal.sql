-- A personal withdrawal before claim opening preserves history and releases only the
-- unused synthetic standing reservation for a fresh independent decision.
CREATE TABLE deceased_filing_withdrawals (
 request_id uuid PRIMARY KEY REFERENCES deceased_filing_standing,
 realm text NOT NULL CHECK(realm='simulation'),
 worker_id uuid NOT NULL REFERENCES actors,
 applicant_id uuid NOT NULL REFERENCES actors,
 withdrawal_receipt_id uuid NOT NULL UNIQUE REFERENCES receipts,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_deceased_withdrawal BEFORE UPDATE OR DELETE ON deceased_filing_withdrawals FOR EACH ROW EXECUTE FUNCTION immutable_record();
ALTER TABLE deceased_filing_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deceased_filing_withdrawals FORCE ROW LEVEL SECURITY;
CREATE POLICY deceased_withdrawals_read ON deceased_filing_withdrawals FOR SELECT USING(realm=context_realm() AND readable_record(request_id));
ALTER TABLE deceased_filing_standing DROP CONSTRAINT deceased_filing_standing_worker_id_key;
CREATE INDEX deceased_filing_standing_worker_idx ON deceased_filing_standing(worker_id);

CREATE FUNCTION simulation_withdraw_deceased_filing(request_in uuid,receipt_in uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE standing deceased_filing_standing%ROWTYPE;
BEGIN
 SELECT * INTO standing FROM deceased_filing_standing WHERE request_id=request_in;
 IF standing.request_id IS NULL OR context_realm()<>'simulation' OR context_subject()<>standing.applicant_id
 THEN RAISE EXCEPTION 'DECEASED_FILING_PERSONAL'; END IF;
 PERFORM id FROM actors WHERE id=standing.worker_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM deceased_filing_claims WHERE request_id=request_in)
 OR EXISTS(SELECT 1 FROM deceased_filing_withdrawals WHERE request_id=request_in)
 THEN RAISE EXCEPTION 'DECEASED_FILING_ALREADY_USED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM receipts p JOIN case_records r ON r.id=p.record_id
  WHERE p.id=receipt_in AND p.realm='simulation' AND r.id=request_in AND r.state='withdrawn'
  AND r.owner_id=standing.applicant_id AND p.version=r.version
  AND p.actor_id=context_subject() AND p.action='withdraw_standing')
 THEN RAISE EXCEPTION 'DECEASED_FILING_RECEIPT'; END IF;
 INSERT INTO deceased_filing_withdrawals(request_id,realm,worker_id,applicant_id,withdrawal_receipt_id)
 VALUES(request_in,'simulation',standing.worker_id,standing.applicant_id,receipt_in);
END $$;

CREATE OR REPLACE FUNCTION simulation_approve_deceased_filing(request_in uuid,review_version_in integer,receipt_in uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE reviewed deceased_filing_reviews%ROWTYPE;
BEGIN
 SELECT * INTO reviewed FROM deceased_filing_reviews WHERE request_id=request_in AND request_version=review_version_in;
 IF reviewed.request_id IS NULL OR NOT COALESCE(simulation_deceased_review_allowed(request_in,reviewed.worker_id,reviewed.capacity),false)
 THEN RAISE EXCEPTION 'DECEASED_FILING_SCOPE'; END IF;
 IF EXISTS(SELECT 1 FROM deceased_filing_reviews WHERE request_id=request_in AND request_version>review_version_in)
 THEN RAISE EXCEPTION 'DECEASED_FILING_REVIEW'; END IF;
 IF NOT EXISTS(SELECT 1 FROM receipts p JOIN case_records r ON r.id=p.record_id
  WHERE p.id=receipt_in AND p.realm='simulation' AND r.id=request_in AND r.state='approved'
  AND r.owner_id=reviewed.applicant_id AND p.version=r.version AND r.version>review_version_in
  AND p.actor_id=context_subject() AND p.action='approve')
 THEN RAISE EXCEPTION 'DECEASED_FILING_RECEIPT'; END IF;
 -- This lock also serializes with ordinary personal-claim creation below.
 PERFORM id FROM actors WHERE id=reviewed.worker_id FOR UPDATE;
 -- A second live reviewed packet for the same worker is a contested standing claim.
 -- Hold both decisions until an independent reviewer resolves the other packet.
 IF EXISTS(
  SELECT 1 FROM deceased_filing_reviews rival
  JOIN case_records pending ON pending.id=rival.request_id
  WHERE rival.worker_id=reviewed.worker_id AND rival.request_id<>request_in
  AND pending.realm='simulation' AND pending.kind='deceased_filing'
  AND pending.state='review' AND pending.version=rival.request_version
 ) THEN RAISE EXCEPTION 'DECEASED_FILING_CONTESTED'; END IF;
 IF EXISTS(
  SELECT 1 FROM deceased_filing_standing standing
  WHERE standing.worker_id=reviewed.worker_id
  AND NOT EXISTS(SELECT 1 FROM deceased_filing_withdrawals withdrawn WHERE withdrawn.request_id=standing.request_id)
 )
 OR EXISTS(SELECT 1 FROM case_records c LEFT JOIN claim_control control ON control.claim_id=c.id
  WHERE c.realm='simulation' AND c.kind='claim' AND COALESCE(control.original_worker_id,c.owner_id)=reviewed.worker_id)
 THEN RAISE EXCEPTION 'DECEASED_WORKER_ALREADY_RECORDED'; END IF;
 INSERT INTO deceased_filing_standing(request_id,realm,worker_id,applicant_id,capacity,review_version,approval_receipt_id)
 VALUES(request_in,'simulation',reviewed.worker_id,reviewed.applicant_id,reviewed.capacity,review_version_in,receipt_in);
END $$;
REVOKE ALL ON deceased_filing_withdrawals FROM PUBLIC;
GRANT SELECT ON deceased_filing_withdrawals TO cornerstone_runtime;
REVOKE ALL ON FUNCTION simulation_withdraw_deceased_filing(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation_withdraw_deceased_filing(uuid,uuid) TO cornerstone_runtime;
