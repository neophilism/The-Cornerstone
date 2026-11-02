-- Hold competing reviewed standing packets for the same synthetic worker.
-- Existing approved decisions remain immutable; the review route resolves live conflicts.
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
 IF EXISTS(SELECT 1 FROM deceased_filing_standing WHERE worker_id=reviewed.worker_id)
 OR EXISTS(SELECT 1 FROM case_records c LEFT JOIN claim_control control ON control.claim_id=c.id
  WHERE c.realm='simulation' AND c.kind='claim' AND COALESCE(control.original_worker_id,c.owner_id)=reviewed.worker_id)
 THEN RAISE EXCEPTION 'DECEASED_WORKER_ALREADY_RECORDED'; END IF;
 INSERT INTO deceased_filing_standing(request_id,realm,worker_id,applicant_id,capacity,review_version,approval_receipt_id)
 VALUES(request_in,'simulation',reviewed.worker_id,reviewed.applicant_id,reviewed.capacity,review_version_in,receipt_in);
END $$;
