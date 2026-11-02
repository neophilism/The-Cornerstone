-- Reconsider a denied synthetic standing request only through a newly assigned reviewer.
-- The original reviewer cannot reopen the same request after an administrative review request.
CREATE OR REPLACE FUNCTION simulation_deceased_review_allowed(request_in uuid,worker_in uuid,capacity_in text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT context_realm()='simulation' AND capacity_in IN ('designated_successor','estate_representative') AND EXISTS(
  SELECT 1 FROM case_records r JOIN actors applicant ON applicant.id=r.owner_id AND applicant.realm=r.realm
  JOIN actors worker ON worker.id=worker_in AND worker.realm=r.realm
  WHERE r.id=request_in AND r.realm='simulation' AND r.kind='deceased_filing'
  AND r.state IN ('submitted','review','approved','review_requested') AND 'participant'=ANY(applicant.roles)
  AND 'participant'=ANY(worker.roles) AND applicant.id<>worker.id
  AND context_subject() NOT IN (applicant.id,worker.id) AND NOT r.id=ANY(applicant.conflicts)
  AND simulation_assigned_labor(r.id)
  AND (r.state<>'review_requested' OR NOT EXISTS(
   SELECT 1 FROM deceased_filing_reviews prior
   WHERE prior.request_id=r.id AND prior.reviewer_id=context_subject()))
 )
$$;

CREATE OR REPLACE FUNCTION simulation_claim_survival_context(request_in uuid,claim_in uuid)
RETURNS TABLE(claim_id uuid,claim_version integer,claim_state text,predecessor_id uuid,holder_version integer,holder_capacity text,original_worker_id uuid,rights_holder_id uuid,enrolled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT c.id,c.version,c.state,c.owner_id,COALESCE(control.holder_version,1),COALESCE(control.capacity,'worker'),
 COALESCE(control.original_worker_id,c.owner_id),COALESCE(control.rights_holder_id,c.owner_id),
 EXISTS(SELECT 1 FROM founding_units u WHERE u.claim_id=c.id)
 FROM case_records request JOIN actors reviewer ON reviewer.id=context_subject() AND reviewer.realm=request.realm
 JOIN case_records c ON c.id=claim_in AND c.realm=request.realm
 LEFT JOIN claim_control control ON control.claim_id=c.id
 WHERE context_realm()='simulation' AND request.id=request_in AND request.realm='simulation'
 AND request.kind='claim_survival' AND request.state IN ('submitted','review','approved','review_requested') AND c.kind='claim'
 AND request.owner_id<>reviewer.id AND c.owner_id<>reviewer.id
 AND COALESCE(control.original_worker_id,c.owner_id)<>reviewer.id
 AND COALESCE(control.rights_holder_id,c.owner_id)<>reviewer.id
 AND NOT EXISTS(SELECT 1 FROM claim_successions s WHERE s.claim_id=c.id AND reviewer.id IN (s.predecessor_id,s.successor_id))
 AND (request.state<>'review_requested' OR NOT EXISTS(
  SELECT 1 FROM claim_survival_reviews prior
  WHERE prior.request_id=request.id AND prior.reviewer_id=reviewer.id))
 AND simulation_assigned_labor(request.id) AND simulation_assigned_labor(c.id)
 AND NOT request.id=ANY(reviewer.conflicts) AND NOT c.id=ANY(reviewer.conflicts)
$$;
