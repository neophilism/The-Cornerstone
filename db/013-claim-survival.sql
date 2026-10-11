-- Pre-enrollment synthetic claim control is case-specific, not account access.
-- Historical owners live in a sidecar; existing immutable versions are untouched.
CREATE TABLE case_version_owners (
 record_id uuid NOT NULL, version integer NOT NULL,
 realm text NOT NULL, owner_id uuid NOT NULL REFERENCES actors,
 PRIMARY KEY(record_id,version),
 FOREIGN KEY(record_id,version) REFERENCES case_versions(record_id,version)
);
INSERT INTO case_version_owners(record_id,version,realm,owner_id)
 SELECT v.record_id,v.version,v.realm,c.owner_id FROM case_versions v JOIN case_records c ON c.id=v.record_id;
CREATE FUNCTION capture_version_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO case_version_owners(record_id,version,realm,owner_id)
 SELECT NEW.record_id,NEW.version,NEW.realm,c.owner_id FROM case_records c
 WHERE c.id=NEW.record_id AND c.realm=NEW.realm;
 RETURN NEW;
END $$;
CREATE TRIGGER capture_case_version_owner AFTER INSERT ON case_versions FOR EACH ROW EXECUTE FUNCTION capture_version_owner();
CREATE TRIGGER immutable_version_owner BEFORE UPDATE OR DELETE ON case_version_owners FOR EACH ROW EXECUTE FUNCTION immutable_record();
ALTER TABLE case_version_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_version_owners FORCE ROW LEVEL SECURITY;
CREATE POLICY version_owners_read ON case_version_owners FOR SELECT USING(realm=context_realm() AND readable_record(record_id));

CREATE TABLE claim_control (
 claim_id uuid PRIMARY KEY REFERENCES case_records,
 realm text NOT NULL CHECK(realm='simulation'),
 original_worker_id uuid NOT NULL REFERENCES actors,
 current_holder_id uuid NOT NULL REFERENCES actors,
 rights_holder_id uuid NOT NULL REFERENCES actors,
 capacity text NOT NULL CHECK(capacity IN ('designated_successor','estate_representative')),
 holder_version integer NOT NULL CHECK(holder_version>=2)
);
CREATE TABLE claim_successions (
 request_id uuid PRIMARY KEY REFERENCES case_records,
 realm text NOT NULL CHECK(realm='simulation'),
 claim_id uuid NOT NULL REFERENCES case_records,
 original_worker_id uuid NOT NULL REFERENCES actors,
 predecessor_id uuid NOT NULL REFERENCES actors,
 successor_id uuid NOT NULL REFERENCES actors,
 from_holder_version integer NOT NULL CHECK(from_holder_version>0),
 to_holder_version integer NOT NULL CHECK(to_holder_version=from_holder_version+1),
 from_claim_version integer NOT NULL CHECK(from_claim_version>0),
 to_claim_version integer NOT NULL CHECK(to_claim_version=from_claim_version+1),
 transfer_basis text NOT NULL CHECK(transfer_basis IN ('holder_death','estate_designation')),
 capacity text NOT NULL CHECK(capacity IN ('designated_successor','estate_representative')),
 deceased_rights_holder_id uuid NOT NULL REFERENCES actors,
 approval_receipt_id uuid NOT NULL UNIQUE REFERENCES receipts,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(predecessor_id<>successor_id), UNIQUE(claim_id,from_holder_version),
 FOREIGN KEY(claim_id,to_claim_version) REFERENCES case_versions(record_id,version) DEFERRABLE INITIALLY DEFERRED
);
CREATE TRIGGER immutable_claim_succession BEFORE UPDATE OR DELETE ON claim_successions FOR EACH ROW EXECUTE FUNCTION immutable_record();
ALTER TABLE claim_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_control FORCE ROW LEVEL SECURITY;
CREATE POLICY claim_control_read ON claim_control FOR SELECT USING(realm=context_realm() AND readable_record(claim_id));
ALTER TABLE claim_successions ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_successions FORCE ROW LEVEL SECURITY;
CREATE POLICY claim_succession_read ON claim_successions FOR SELECT USING(realm=context_realm() AND (readable_record(claim_id) OR readable_record(request_id)));

CREATE FUNCTION simulation_claim_survival_context(request_in uuid,claim_in uuid)
RETURNS TABLE(claim_id uuid,claim_version integer,claim_state text,predecessor_id uuid,holder_version integer,holder_capacity text,original_worker_id uuid,rights_holder_id uuid,enrolled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT c.id,c.version,c.state,c.owner_id,COALESCE(control.holder_version,1),COALESCE(control.capacity,'worker'),
 COALESCE(control.original_worker_id,c.owner_id),COALESCE(control.rights_holder_id,c.owner_id),
 EXISTS(SELECT 1 FROM founding_units u WHERE u.claim_id=c.id)
 FROM case_records request JOIN actors reviewer ON reviewer.id=context_subject() AND reviewer.realm=request.realm
 JOIN case_records c ON c.id=claim_in AND c.realm=request.realm
 LEFT JOIN claim_control control ON control.claim_id=c.id
 WHERE context_realm()='simulation' AND request.id=request_in AND request.realm='simulation'
 AND request.kind='claim_survival' AND request.state IN ('submitted','review','approved') AND c.kind='claim'
 AND request.owner_id<>reviewer.id AND c.owner_id<>reviewer.id
 AND COALESCE(control.original_worker_id,c.owner_id)<>reviewer.id
 AND COALESCE(control.rights_holder_id,c.owner_id)<>reviewer.id
 AND NOT EXISTS(SELECT 1 FROM claim_successions s WHERE s.claim_id=c.id AND reviewer.id IN (s.predecessor_id,s.successor_id))
 AND simulation_assigned_labor(request.id) AND simulation_assigned_labor(c.id)
 AND NOT request.id=ANY(reviewer.conflicts) AND NOT c.id=ANY(reviewer.conflicts)
$$;

CREATE FUNCTION guard_case_owner_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.owner_id IS DISTINCT FROM OLD.owner_id AND NOT EXISTS(
  SELECT 1 FROM claim_successions s JOIN receipts r ON r.id=s.approval_receipt_id
  JOIN case_records request ON request.id=s.request_id
  WHERE OLD.kind='claim' AND OLD.realm='simulation' AND NEW.realm=OLD.realm AND NEW.kind=OLD.kind
  AND s.claim_id=OLD.id AND s.predecessor_id=OLD.owner_id AND s.successor_id=NEW.owner_id
  AND s.from_claim_version=OLD.version AND s.to_claim_version=OLD.version+1
  AND request.state='approved' AND request.version=r.version AND r.actor_id=context_subject()
  AND r.action='approve' AND simulation_assigned_labor(request.id) AND simulation_assigned_labor(OLD.id)
 ) THEN RAISE EXCEPTION 'CASE_OWNER_CHANGE_REQUIRES_SURVIVAL_DECISION'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_case_owner BEFORE UPDATE OF owner_id ON case_records FOR EACH ROW EXECUTE FUNCTION guard_case_owner_change();

CREATE FUNCTION simulation_transfer_claim_control(request_in uuid,claim_in uuid,claim_version_in integer,holder_version_in integer,predecessor_in uuid,basis_in text,capacity_in text,receipt_in uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE context record; successor uuid; BEGIN
 IF NOT EXISTS(SELECT 1 FROM simulation_claim_survival_context(request_in,claim_in))
 THEN RAISE EXCEPTION 'CLAIM_SURVIVAL_SCOPE'; END IF;
 PERFORM id FROM case_records WHERE id=claim_in FOR UPDATE;
 SELECT * INTO context FROM simulation_claim_survival_context(request_in,claim_in);
 IF NOT FOUND THEN RAISE EXCEPTION 'CLAIM_SURVIVAL_SCOPE'; END IF;
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

-- Enrollment and a holder change serialize on the original claim, never a copy.
CREATE OR REPLACE FUNCTION simulation_close_founding_units(association_in uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF context_realm()<>'simulation' OR NOT simulation_assigned_labor(association_in)
 OR NOT EXISTS(SELECT 1 FROM case_records WHERE id=association_in AND kind='association' AND state='review' AND realm='simulation')
 THEN RAISE EXCEPTION 'Assigned Labor and an open review required'; END IF;
 PERFORM c.id FROM case_records c JOIN founding_invitations i ON i.claim_id=c.id WHERE i.association_id=association_in ORDER BY c.id FOR UPDATE OF c;
 IF (SELECT count(*) FROM founding_invitations WHERE association_id=association_in)<2
 OR EXISTS(SELECT 1 FROM founding_invitations i LEFT JOIN case_records c ON c.id=i.claim_id LEFT JOIN actors a ON a.id=i.person_id
 WHERE i.association_id=association_in AND (i.response<>'accepted' OR c.kind<>'claim' OR c.state<>'eligible' OR c.realm<>'simulation' OR c.owner_id<>i.person_id OR a.realm<>'simulation'))
 THEN RAISE EXCEPTION 'Personally accepted eligible roll with unchanged claim holders required'; END IF;
 INSERT INTO founding_units(id,realm,association_id,claim_id,person_id,holder_capacity,rights_holder_id)
 SELECT gen_random_uuid(),'simulation',i.association_id,i.claim_id,i.person_id,COALESCE(control.capacity,'founder'),COALESCE(control.rights_holder_id,i.person_id)
 FROM founding_invitations i LEFT JOIN claim_control control ON control.claim_id=i.claim_id WHERE i.association_id=association_in ORDER BY i.claim_id;
 UPDATE actors SET roles=array_append(roles,'member') WHERE realm='simulation' AND NOT 'member'=ANY(roles)
 AND id IN (SELECT person_id FROM founding_invitations WHERE association_id=association_in);
END $$;
CREATE OR REPLACE FUNCTION register_founding_unit(unit_in uuid,realm_in text,association_in uuid,claim_in uuid,person_in uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF realm_in<>'simulation' OR context_realm()<>'simulation' OR NOT simulation_assigned_labor(association_in)
 OR NOT EXISTS(SELECT 1 FROM case_records WHERE id=association_in AND kind='association' AND state='review' AND realm='simulation')
 THEN RAISE EXCEPTION 'Assigned Labor and an open review required'; END IF;
 PERFORM id FROM case_records WHERE id=claim_in FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM case_records c WHERE c.id=claim_in AND c.realm='simulation' AND c.kind='claim' AND c.state='eligible' AND c.owner_id=person_in)
 OR NOT EXISTS(SELECT 1 FROM founding_invitations i WHERE i.association_id=association_in AND i.claim_id=claim_in AND i.person_id=person_in AND i.response='accepted')
 THEN RAISE EXCEPTION 'Eligible claim, current holder and personal consent required'; END IF;
 INSERT INTO founding_units(id,realm,association_id,claim_id,person_id,holder_capacity,rights_holder_id)
 SELECT unit_in,realm_in,association_in,claim_in,person_in,COALESCE(control.capacity,'founder'),COALESCE(control.rights_holder_id,person_in)
 FROM case_records c LEFT JOIN claim_control control ON control.claim_id=c.id WHERE c.id=claim_in;
 UPDATE actors SET roles=array_append(roles,'member') WHERE id=person_in AND realm='simulation' AND NOT 'member'=ANY(roles);
END $$;
CREATE OR REPLACE FUNCTION simulation_respond_invitation(invitation_in uuid,response_in text,digest_in text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target founding_invitations%ROWTYPE; BEGIN
 SELECT i.* INTO target FROM founding_invitations i JOIN case_records association ON association.id=i.association_id
 JOIN actors a ON a.id=context_subject() AND a.realm=i.realm
 WHERE context_realm()='simulation' AND i.id=invitation_in AND i.person_id=a.id AND i.terms_digest=digest_in
 AND i.closes_on>=CURRENT_DATE AND association.realm='simulation' AND association.state IN ('submitted','review') AND NOT association.id=ANY(a.conflicts);
 IF target.id IS NULL OR response_in IS NULL OR response_in NOT IN ('accepted','declined')
 THEN RAISE EXCEPTION 'Own open founding invitation and unchanged terms required'; END IF;
 PERFORM id FROM case_records WHERE id=target.claim_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM case_records c WHERE c.id=target.claim_id AND c.realm='simulation' AND c.kind='claim' AND c.state='eligible' AND c.owner_id=context_subject())
 THEN RAISE EXCEPTION 'FOUNDING_HOLDER_CHANGED'; END IF;
 IF response_in='accepted' AND (EXISTS(SELECT 1 FROM founding_units u WHERE u.claim_id=target.claim_id AND u.active)
 OR EXISTS(SELECT 1 FROM founding_invitations i JOIN case_records a ON a.id=i.association_id
 WHERE i.claim_id=target.claim_id AND i.person_id=context_subject() AND i.association_id<>target.association_id AND i.response='accepted' AND a.state IN ('submitted','review')))
 THEN RAISE EXCEPTION 'COHORT_ALREADY_SELECTED'; END IF;
 UPDATE founding_invitations SET response=response_in,responded_at=now() WHERE id=invitation_in AND person_id=context_subject();
END $$;

INSERT INTO simulation_routing(kind,institution_id,roles)
 SELECT 'claim_survival',institution_id,roles FROM simulation_routing WHERE kind='claim' ON CONFLICT(kind) DO NOTHING;
REVOKE ALL ON case_version_owners,claim_control,claim_successions FROM PUBLIC;
GRANT SELECT ON case_version_owners,claim_control,claim_successions TO cornerstone_runtime;
REVOKE ALL ON FUNCTION capture_version_owner(),guard_case_owner_change(),simulation_claim_survival_context(uuid,uuid),simulation_transfer_claim_control(uuid,uuid,integer,integer,uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation_claim_survival_context(uuid,uuid),simulation_transfer_claim_control(uuid,uuid,integer,integer,uuid,text,text,uuid) TO cornerstone_runtime;
