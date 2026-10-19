-- A timely administrative review request keeps a contested successor packet live.
-- The hold ends when a different assigned reviewer reopens the denied packet for correction.
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
  AND ((pending.state='review' AND pending.version=rival.request_version)
   OR (pending.state='review_requested' AND pending.version>rival.request_version))
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

CREATE OR REPLACE FUNCTION simulation_transfer_claim_control(request_in uuid,claim_in uuid,claim_version_in integer,holder_version_in integer,predecessor_in uuid,basis_in text,capacity_in text,receipt_in uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE context record; successor uuid; BEGIN
 IF NOT EXISTS(SELECT 1 FROM simulation_claim_survival_context(request_in,claim_in))
 THEN RAISE EXCEPTION 'CLAIM_SURVIVAL_SCOPE'; END IF;
 PERFORM id FROM case_records WHERE id=claim_in FOR UPDATE;
 SELECT * INTO context FROM simulation_claim_survival_context(request_in,claim_in);
 IF NOT FOUND THEN RAISE EXCEPTION 'CLAIM_SURVIVAL_SCOPE'; END IF;
 IF EXISTS(
  SELECT 1 FROM claim_survival_reviews rival
  JOIN case_records pending ON pending.id=rival.request_id
  WHERE rival.claim_id=claim_in AND rival.request_id<>request_in
  AND pending.realm='simulation' AND pending.kind='claim_survival'
  AND ((pending.state='review' AND pending.version=rival.request_version)
   OR (pending.state='review_requested' AND pending.version>rival.request_version))
 ) THEN RAISE EXCEPTION 'CLAIM_SURVIVAL_CONTESTED'; END IF;
 IF context.enrolled OR context.claim_state IN ('provisional','remedied')
 THEN RAISE EXCEPTION 'CLAIM_ALREADY_ENROLLED'; END IF;
 IF claim_version_in IS NULL OR holder_version_in IS NULL OR predecessor_in IS NULL
 OR context.claim_version<>claim_version_in OR context.holder_version<>holder_version_in OR context.predecessor_id<>predecessor_in
 THEN RAISE EXCEPTION 'CLAIM_SURVIVAL_STALE'; END IF;
 SELECT owner_id INTO successor FROM case_records WHERE id=request_in AND state='approved';
 IF successor IS NULL OR successor=predecessor_in OR successor=context.rights_holder_id OR successor=context.original_worker_id
 OR NOT EXISTS(SELECT 1 FROM actors a WHERE a.id=successor AND a.realm='simulation' AND 'participant'=ANY(a.roles)
 AND NOT claim_in=ANY(a.conflicts) AND NOT request_in=ANY(a.conflicts))
 THEN RAISE EXCEPTION 'CLAIM_SURVIVAL_RECIPIENT'; END IF;
 IF basis_in IS NULL OR capacity_in IS NULL OR capacity_in NOT IN ('designated_successor','estate_representative') OR NOT (
  (basis_in='holder_death' AND context.holder_capacity IN ('worker','designated_successor'))
  OR (basis_in='estate_designation' AND context.holder_capacity='estate_representative' AND capacity_in='designated_successor')
 ) THEN RAISE EXCEPTION 'CLAIM_SURVIVAL_CAPACITY'; END IF;
 IF NOT EXISTS(SELECT 1 FROM receipts p JOIN case_records r ON r.id=p.record_id WHERE p.id=receipt_in
 AND p.realm='simulation' AND p.record_id=request_in AND p.version=r.version AND p.actor_id=context_subject() AND p.action='approve')
 THEN RAISE EXCEPTION 'CLAIM_SURVIVAL_RECEIPT'; END IF;
 INSERT INTO claim_successions(request_id,realm,claim_id,original_worker_id,predecessor_id,successor_id,from_holder_version,to_holder_version,from_claim_version,to_claim_version,transfer_basis,capacity,deceased_rights_holder_id,approval_receipt_id)
 VALUES(request_in,'simulation',claim_in,context.original_worker_id,predecessor_in,successor,holder_version_in,holder_version_in+1,claim_version_in,claim_version_in+1,basis_in,capacity_in,context.rights_holder_id,receipt_in);
 INSERT INTO claim_control(claim_id,realm,original_worker_id,current_holder_id,rights_holder_id,capacity,holder_version)
 VALUES(claim_in,'simulation',context.original_worker_id,successor,CASE WHEN capacity_in='designated_successor' THEN successor ELSE context.rights_holder_id END,capacity_in,holder_version_in+1)
 ON CONFLICT(claim_id) DO UPDATE SET current_holder_id=EXCLUDED.current_holder_id,rights_holder_id=EXCLUDED.rights_holder_id,capacity=EXCLUDED.capacity,holder_version=EXCLUDED.holder_version;
 UPDATE case_records SET owner_id=successor WHERE id=claim_in;
 UPDATE grants SET revoked_at=now() WHERE record_id=claim_in AND revoked_at IS NULL;
END $$;
