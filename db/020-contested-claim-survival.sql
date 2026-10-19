-- A current reviewed successor dispute holds all competing transfers of one existing claim.
CREATE TABLE claim_survival_reviews (
 request_id uuid NOT NULL REFERENCES case_records,
 request_version integer NOT NULL CHECK(request_version>0),
 realm text NOT NULL CHECK(realm='simulation'),
 claim_id uuid NOT NULL REFERENCES case_records,
 reviewer_id uuid NOT NULL REFERENCES actors,
 review_receipt_id uuid NOT NULL UNIQUE REFERENCES receipts,
 PRIMARY KEY(request_id,request_version),
 FOREIGN KEY(request_id,request_version) REFERENCES case_versions(record_id,version)
);
CREATE INDEX claim_survival_reviews_claim_idx ON claim_survival_reviews(claim_id);
CREATE TRIGGER immutable_claim_survival_review BEFORE UPDATE OR DELETE ON claim_survival_reviews FOR EACH ROW EXECUTE FUNCTION immutable_record();
ALTER TABLE claim_survival_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_survival_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY claim_survival_reviews_read ON claim_survival_reviews FOR SELECT USING(realm=context_realm() AND readable_record(request_id));

CREATE FUNCTION simulation_record_claim_survival_review(request_in uuid,claim_in uuid,receipt_in uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM simulation_claim_survival_context(request_in,claim_in))
 THEN RAISE EXCEPTION 'CLAIM_SURVIVAL_SCOPE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM receipts p JOIN case_records r ON r.id=p.record_id
  WHERE p.id=receipt_in AND p.realm='simulation' AND r.id=request_in AND r.state='review'
  AND p.version=r.version AND p.actor_id=context_subject() AND p.action='begin_review')
 THEN RAISE EXCEPTION 'CLAIM_SURVIVAL_RECEIPT'; END IF;
 INSERT INTO claim_survival_reviews(request_id,request_version,realm,claim_id,reviewer_id,review_receipt_id)
 SELECT r.id,r.version,'simulation',claim_in,context_subject(),receipt_in
 FROM case_records r WHERE r.id=request_in;
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
  AND pending.state='review' AND pending.version=rival.request_version
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
REVOKE ALL ON claim_survival_reviews FROM PUBLIC;
GRANT SELECT ON claim_survival_reviews TO cornerstone_runtime;
REVOKE ALL ON FUNCTION simulation_record_claim_survival_review(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation_record_claim_survival_review(uuid,uuid,uuid) TO cornerstone_runtime;
