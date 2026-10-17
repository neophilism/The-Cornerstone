-- Synthetic standing for a newly filed historical-worker claim, not account inheritance.
-- Decisions and the one resulting claim are receipt-bound and append-only.
CREATE TABLE deceased_filing_reviews (
 request_id uuid NOT NULL REFERENCES case_records,
 request_version integer NOT NULL CHECK(request_version>0),
 realm text NOT NULL CHECK(realm='simulation'),
 worker_id uuid NOT NULL REFERENCES actors,
 applicant_id uuid NOT NULL REFERENCES actors,
 capacity text NOT NULL CHECK(capacity IN ('designated_successor','estate_representative')),
 reviewer_id uuid NOT NULL REFERENCES actors,
 review_receipt_id uuid NOT NULL UNIQUE REFERENCES receipts,
 PRIMARY KEY(request_id,request_version), CHECK(worker_id<>applicant_id),
 FOREIGN KEY(request_id,request_version) REFERENCES case_versions(record_id,version)
);
CREATE TABLE deceased_filing_standing (
 request_id uuid PRIMARY KEY REFERENCES case_records,
 realm text NOT NULL CHECK(realm='simulation'),
 worker_id uuid NOT NULL UNIQUE REFERENCES actors,
 applicant_id uuid NOT NULL REFERENCES actors,
 capacity text NOT NULL CHECK(capacity IN ('designated_successor','estate_representative')),
 review_version integer NOT NULL,
 approval_receipt_id uuid NOT NULL UNIQUE REFERENCES receipts,
 FOREIGN KEY(request_id,review_version) REFERENCES deceased_filing_reviews(request_id,request_version),
 CHECK(worker_id<>applicant_id)
);
CREATE TABLE deceased_filing_claims (
 request_id uuid PRIMARY KEY REFERENCES deceased_filing_standing,
 realm text NOT NULL CHECK(realm='simulation'),
 claim_id uuid NOT NULL UNIQUE REFERENCES case_records,
 opening_receipt_id uuid NOT NULL UNIQUE REFERENCES receipts,
 creation_receipt_id uuid NOT NULL UNIQUE REFERENCES receipts
);
CREATE TRIGGER immutable_deceased_review BEFORE UPDATE OR DELETE ON deceased_filing_reviews FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_deceased_standing BEFORE UPDATE OR DELETE ON deceased_filing_standing FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_deceased_claim BEFORE UPDATE OR DELETE ON deceased_filing_claims FOR EACH ROW EXECUTE FUNCTION immutable_record();
ALTER TABLE deceased_filing_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE deceased_filing_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE deceased_filing_standing ENABLE ROW LEVEL SECURITY;
ALTER TABLE deceased_filing_standing FORCE ROW LEVEL SECURITY;
ALTER TABLE deceased_filing_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE deceased_filing_claims FORCE ROW LEVEL SECURITY;
CREATE POLICY deceased_reviews_read ON deceased_filing_reviews FOR SELECT USING(realm=context_realm() AND readable_record(request_id));
CREATE POLICY deceased_standing_read ON deceased_filing_standing FOR SELECT USING(realm=context_realm() AND readable_record(request_id));
CREATE POLICY deceased_claims_read ON deceased_filing_claims FOR SELECT USING(realm=context_realm() AND readable_record(request_id) AND readable_record(claim_id));

CREATE FUNCTION simulation_deceased_review_allowed(request_in uuid,worker_in uuid,capacity_in text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT context_realm()='simulation' AND capacity_in IN ('designated_successor','estate_representative') AND EXISTS(
  SELECT 1 FROM case_records r JOIN actors applicant ON applicant.id=r.owner_id AND applicant.realm=r.realm
  JOIN actors worker ON worker.id=worker_in AND worker.realm=r.realm
  WHERE r.id=request_in AND r.realm='simulation' AND r.kind='deceased_filing'
  AND r.state IN ('submitted','review','approved') AND 'participant'=ANY(applicant.roles)
  AND 'participant'=ANY(worker.roles) AND applicant.id<>worker.id
  AND context_subject() NOT IN (applicant.id,worker.id) AND NOT r.id=ANY(applicant.conflicts)
  AND simulation_assigned_labor(r.id)
 )
$$;

CREATE FUNCTION simulation_deceased_claim_review_allowed(claim_in uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT context_realm()='simulation' AND EXISTS(
  SELECT 1 FROM case_records c JOIN claim_control control ON control.claim_id=c.id
  JOIN deceased_filing_claims opened ON opened.claim_id=c.id
  JOIN deceased_filing_standing standing ON standing.request_id=opened.request_id
  WHERE c.id=claim_in AND c.realm='simulation' AND c.kind='claim'
  AND context_subject() NOT IN (control.original_worker_id,control.current_holder_id,
   control.rights_holder_id,standing.applicant_id)
  AND NOT EXISTS(SELECT 1 FROM claim_successions history WHERE history.claim_id=c.id
   AND context_subject() IN (history.predecessor_id,history.successor_id))
  AND simulation_assigned_labor(c.id)
 )
$$;

CREATE FUNCTION simulation_record_deceased_review(request_in uuid,worker_in uuid,capacity_in text,receipt_in uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT COALESCE(simulation_deceased_review_allowed(request_in,worker_in,capacity_in),false)
 THEN RAISE EXCEPTION 'DECEASED_FILING_SCOPE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM receipts p JOIN case_records r ON r.id=p.record_id
  WHERE p.id=receipt_in AND p.realm='simulation' AND r.id=request_in AND r.state='review'
  AND p.version=r.version AND p.actor_id=context_subject() AND p.action='begin_review')
 THEN RAISE EXCEPTION 'DECEASED_FILING_RECEIPT'; END IF;
 INSERT INTO deceased_filing_reviews(request_id,request_version,realm,worker_id,applicant_id,capacity,reviewer_id,review_receipt_id)
 SELECT r.id,r.version,'simulation',worker_in,r.owner_id,capacity_in,context_subject(),receipt_in
 FROM case_records r WHERE r.id=request_in;
END $$;

CREATE FUNCTION simulation_approve_deceased_filing(request_in uuid,review_version_in integer,receipt_in uuid)
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
 IF EXISTS(SELECT 1 FROM deceased_filing_standing WHERE worker_id=reviewed.worker_id)
 OR EXISTS(SELECT 1 FROM case_records c LEFT JOIN claim_control control ON control.claim_id=c.id
  WHERE c.realm='simulation' AND c.kind='claim' AND COALESCE(control.original_worker_id,c.owner_id)=reviewed.worker_id)
 THEN RAISE EXCEPTION 'DECEASED_WORKER_ALREADY_RECORDED'; END IF;
 INSERT INTO deceased_filing_standing(request_id,realm,worker_id,applicant_id,capacity,review_version,approval_receipt_id)
 VALUES(request_in,'simulation',reviewed.worker_id,reviewed.applicant_id,reviewed.capacity,review_version_in,receipt_in);
END $$;

CREATE FUNCTION guard_deceased_worker_claim() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.realm='simulation' AND NEW.kind='claim' THEN
  PERFORM id FROM actors WHERE id=NEW.owner_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM deceased_filing_standing WHERE worker_id=NEW.owner_id)
  THEN RAISE EXCEPTION 'DECEASED_WORKER_ALREADY_RECORDED'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_deceased_personal_claim BEFORE INSERT ON case_records FOR EACH ROW EXECUTE FUNCTION guard_deceased_worker_claim();

CREATE FUNCTION simulation_deceased_open_context(request_in uuid)
RETURNS TABLE(worker_id uuid,applicant_id uuid,capacity text,approval_receipt_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE standing deceased_filing_standing%ROWTYPE;
BEGIN
 SELECT s.* INTO standing FROM deceased_filing_standing s JOIN case_records r ON r.id=s.request_id
 JOIN receipts p ON p.id=s.approval_receipt_id JOIN actors a ON a.id=context_subject() AND a.realm=r.realm
 WHERE context_realm()='simulation' AND r.id=request_in AND r.realm='simulation' AND r.kind='deceased_filing'
 AND r.state='approved' AND r.version=p.version AND r.owner_id=a.id AND s.applicant_id=a.id
 AND 'participant'=ANY(a.roles) AND NOT r.id=ANY(a.conflicts) AND readable_record(r.id);
 IF standing.request_id IS NULL THEN RAISE EXCEPTION 'DECEASED_FILING_PERSONAL'; END IF;
 PERFORM a.id FROM actors a WHERE a.id IN (standing.worker_id,standing.applicant_id) ORDER BY a.id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM deceased_filing_claims WHERE request_id=request_in)
 THEN RAISE EXCEPTION 'DECEASED_CLAIM_ALREADY_OPENED'; END IF;
 RETURN QUERY SELECT standing.worker_id,standing.applicant_id,standing.capacity,standing.approval_receipt_id;
END $$;

-- A new deceased-worker filing starts its own case-specific holder history at one.
ALTER TABLE claim_control DROP CONSTRAINT claim_control_holder_version_check;
ALTER TABLE claim_control ADD CONSTRAINT claim_control_holder_version_check CHECK(holder_version>=1);

CREATE FUNCTION simulation_register_deceased_claim(request_in uuid,claim_in uuid,opening_in uuid,creation_in uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE standing deceased_filing_standing%ROWTYPE;
BEGIN
 SELECT s.* INTO standing FROM deceased_filing_standing s JOIN case_records r ON r.id=s.request_id
 JOIN actors a ON a.id=context_subject() AND a.realm=r.realm
 WHERE context_realm()='simulation' AND r.id=request_in AND r.realm='simulation' AND r.kind='deceased_filing'
 AND r.state='claim_opened' AND r.owner_id=a.id AND s.applicant_id=a.id
 AND 'participant'=ANY(a.roles) AND NOT r.id=ANY(a.conflicts) AND readable_record(r.id);
 IF standing.request_id IS NULL THEN RAISE EXCEPTION 'DECEASED_FILING_PERSONAL'; END IF;
 PERFORM a.id FROM actors a WHERE a.id IN (standing.worker_id,standing.applicant_id) ORDER BY a.id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM deceased_filing_claims WHERE request_id=request_in)
 THEN RAISE EXCEPTION 'DECEASED_CLAIM_ALREADY_OPENED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM receipts p JOIN case_records r ON r.id=p.record_id
  WHERE p.id=opening_in AND p.realm='simulation' AND r.id=request_in AND p.version=r.version
  AND p.actor_id=context_subject() AND p.action='open_claim')
 OR NOT EXISTS(SELECT 1 FROM receipts p JOIN case_records c ON c.id=p.record_id
  WHERE p.id=creation_in AND p.realm='simulation' AND c.id=claim_in AND c.realm='simulation'
  AND c.kind='claim' AND c.state='draft' AND c.version=1 AND c.owner_id=context_subject()
  AND p.version=1 AND p.actor_id=context_subject() AND p.action='create'
  AND c.xmin::text=pg_current_xact_id()::text)
 THEN RAISE EXCEPTION 'DECEASED_FILING_RECEIPT'; END IF;
 INSERT INTO deceased_filing_claims(request_id,realm,claim_id,opening_receipt_id,creation_receipt_id)
 VALUES(request_in,'simulation',claim_in,opening_in,creation_in);
 INSERT INTO claim_control(claim_id,realm,original_worker_id,current_holder_id,rights_holder_id,capacity,holder_version)
 VALUES(claim_in,'simulation',standing.worker_id,standing.applicant_id,
  CASE WHEN standing.capacity='estate_representative' THEN standing.worker_id ELSE standing.applicant_id END,
  standing.capacity,1);
END $$;

INSERT INTO simulation_routing(kind,institution_id,roles)
 SELECT 'deceased_filing',institution_id,roles FROM simulation_routing WHERE kind='claim' ON CONFLICT(kind) DO NOTHING;
REVOKE ALL ON deceased_filing_reviews,deceased_filing_standing,deceased_filing_claims FROM PUBLIC;
GRANT SELECT ON deceased_filing_reviews,deceased_filing_standing,deceased_filing_claims TO cornerstone_runtime;
REVOKE ALL ON FUNCTION simulation_deceased_review_allowed(uuid,uuid,text),simulation_deceased_claim_review_allowed(uuid),simulation_record_deceased_review(uuid,uuid,text,uuid),simulation_approve_deceased_filing(uuid,integer,uuid),guard_deceased_worker_claim(),simulation_deceased_open_context(uuid),simulation_register_deceased_claim(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation_deceased_review_allowed(uuid,uuid,text),simulation_deceased_claim_review_allowed(uuid),simulation_record_deceased_review(uuid,uuid,text,uuid),simulation_approve_deceased_filing(uuid,integer,uuid),simulation_deceased_open_context(uuid),simulation_register_deceased_claim(uuid,uuid,uuid,uuid) TO cornerstone_runtime;
