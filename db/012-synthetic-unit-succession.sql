-- Post-enrollment synthetic succession. No new unit, claim, vote or private
-- account is created or conveyed. Real authority/proofing remains disabled.
ALTER TABLE founding_units ADD COLUMN holder_version integer NOT NULL DEFAULT 1 CHECK(holder_version>0);
ALTER TABLE founding_units ADD COLUMN holder_capacity text NOT NULL DEFAULT 'founder'
 CHECK(holder_capacity IN ('founder','designated_successor','estate_representative','unverified_legacy'));
ALTER TABLE founding_units ADD COLUMN rights_holder_id uuid REFERENCES actors;
UPDATE founding_units SET rights_holder_id=person_id,
 holder_capacity=CASE WHEN successor_id IS NULL THEN 'founder' ELSE 'unverified_legacy' END;
ALTER TABLE founding_units ALTER COLUMN rights_holder_id SET NOT NULL;
-- Future ordinary founding insertions retain their original rights holder.
CREATE FUNCTION initialize_unit_holder() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.rights_holder_id IS NULL THEN NEW.rights_holder_id=NEW.person_id; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER unit_initial_holder BEFORE INSERT ON founding_units FOR EACH ROW EXECUTE FUNCTION initialize_unit_holder();
CREATE UNIQUE INDEX one_active_vote_per_association ON founding_units(association_id,COALESCE(successor_id,person_id)) WHERE active;

CREATE TABLE unit_successions (
 id uuid PRIMARY KEY, realm text NOT NULL CHECK(realm='simulation'),
 request_id uuid NOT NULL UNIQUE REFERENCES case_records,
 unit_id uuid NOT NULL REFERENCES founding_units,
 association_id uuid NOT NULL REFERENCES case_records,
 claim_id uuid NOT NULL REFERENCES case_records,
 predecessor_id uuid NOT NULL REFERENCES actors,
 successor_id uuid NOT NULL REFERENCES actors,
 from_version integer NOT NULL CHECK(from_version>0),
 to_version integer NOT NULL CHECK(to_version=from_version+1),
 transfer_basis text NOT NULL CHECK(transfer_basis IN ('member_death','estate_designation')),
 capacity text NOT NULL CHECK(capacity IN ('designated_successor','estate_representative')),
 deceased_rights_holder_id uuid NOT NULL REFERENCES actors,
 receipt_id uuid NOT NULL UNIQUE REFERENCES receipts,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(predecessor_id<>successor_id), UNIQUE(unit_id,from_version)
);
CREATE TRIGGER immutable_unit_succession BEFORE UPDATE OR DELETE ON unit_successions FOR EACH ROW EXECUTE FUNCTION immutable_record();
ALTER TABLE unit_successions ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_successions FORCE ROW LEVEL SECURITY;
CREATE POLICY succession_history_read ON unit_successions FOR SELECT USING(
 realm=context_realm() AND readable_record(request_id)
 AND (successor_id=context_subject() OR simulation_assigned_labor(request_id))
);

CREATE FUNCTION simulation_succession_context(request_in uuid,unit_in uuid)
RETURNS TABLE(unit_id uuid,association_id uuid,claim_id uuid,predecessor_id uuid,holder_version integer,holder_capacity text,rights_holder_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT u.id,u.association_id,u.claim_id,COALESCE(u.successor_id,u.person_id),u.holder_version,u.holder_capacity,u.rights_holder_id
 FROM case_records request JOIN actors reviewer ON reviewer.id=context_subject() AND reviewer.realm=request.realm
 JOIN founding_units u ON u.id=unit_in AND u.realm=request.realm
 JOIN case_records association ON association.id=u.association_id AND association.realm=u.realm
 JOIN case_records claim ON claim.id=u.claim_id AND claim.realm=u.realm
 WHERE context_realm()='simulation' AND request.id=request_in AND request.realm='simulation'
 AND request.kind='succession' AND request.state IN ('submitted','review','approved')
 AND request.owner_id<>reviewer.id AND reviewer.id<>COALESCE(u.successor_id,u.person_id)
 AND reviewer.id<>u.person_id AND reviewer.id<>u.rights_holder_id
 AND NOT EXISTS(SELECT 1 FROM unit_successions s WHERE s.unit_id=u.id AND reviewer.id IN (s.predecessor_id,s.successor_id))
 AND u.active AND u.holder_capacity<>'unverified_legacy'
 AND association.kind='association' AND association.state IN ('ready','provisional','operating')
 AND claim.kind='claim' AND claim.state IN ('eligible','provisional','remedied')
 AND simulation_assigned_labor(request.id) AND simulation_assigned_labor(association.id)
 AND simulation_assigned_labor(claim.id)
 AND NOT request.id=ANY(reviewer.conflicts) AND NOT association.id=ANY(reviewer.conflicts) AND NOT claim.id=ANY(reviewer.conflicts)
$$;

CREATE FUNCTION simulation_transfer_unit(request_in uuid,unit_in uuid,version_in integer,predecessor_in uuid,basis_in text,capacity_in text,receipt_in uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u founding_units%ROWTYPE; successor uuid; BEGIN
 IF NOT EXISTS(SELECT 1 FROM simulation_succession_context(request_in,unit_in))
 THEN RAISE EXCEPTION 'SUCCESSION_SCOPE'; END IF;
 -- Serializes competing approvals with each other and with a pending ballot.
 SELECT * INTO u FROM founding_units WHERE id=unit_in FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM simulation_succession_context(request_in,unit_in))
 THEN RAISE EXCEPTION 'SUCCESSION_SCOPE'; END IF;
 IF version_in IS NULL OR predecessor_in IS NULL OR u.holder_version<>version_in OR COALESCE(u.successor_id,u.person_id)<>predecessor_in
 THEN RAISE EXCEPTION 'SUCCESSION_STALE'; END IF;
 SELECT owner_id INTO successor FROM case_records WHERE id=request_in AND state='approved';
 IF successor IS NULL OR successor=predecessor_in OR successor=u.rights_holder_id OR NOT EXISTS(
  SELECT 1 FROM actors a JOIN case_records r ON r.id=request_in AND r.realm=a.realm
  WHERE a.id=successor AND a.realm='simulation' AND 'participant'=ANY(a.roles)
  AND NOT r.id=ANY(a.conflicts) AND NOT u.association_id=ANY(a.conflicts) AND NOT u.claim_id=ANY(a.conflicts)
 ) THEN RAISE EXCEPTION 'SUCCESSION_RECIPIENT'; END IF;
 IF capacity_in IS NULL OR capacity_in NOT IN ('designated_successor','estate_representative')
 OR basis_in IS NULL OR NOT (
  (basis_in='member_death' AND u.holder_capacity IN ('founder','designated_successor'))
  OR (basis_in='estate_designation' AND u.holder_capacity='estate_representative' AND capacity_in='designated_successor')
 ) THEN RAISE EXCEPTION 'SUCCESSION_CAPACITY'; END IF;
 IF NOT EXISTS(SELECT 1 FROM receipts p JOIN case_records r ON r.id=p.record_id
 WHERE p.id=receipt_in AND p.record_id=request_in AND p.version=r.version AND r.realm='simulation'
 AND p.actor_id=context_subject() AND p.action='approve' AND p.realm=r.realm)
 THEN RAISE EXCEPTION 'SUCCESSION_RECEIPT'; END IF;
 IF EXISTS(SELECT 1 FROM founding_units f WHERE f.association_id=u.association_id AND f.active
 AND f.id<>u.id AND COALESCE(f.successor_id,f.person_id)=successor)
 THEN RAISE EXCEPTION 'SUCCESSION_VOTE_COLLISION'; END IF;
 INSERT INTO unit_successions(id,realm,request_id,unit_id,association_id,claim_id,predecessor_id,successor_id,from_version,to_version,transfer_basis,capacity,deceased_rights_holder_id,receipt_id)
 VALUES(gen_random_uuid(),'simulation',request_in,u.id,u.association_id,u.claim_id,predecessor_in,successor,u.holder_version,u.holder_version+1,basis_in,capacity_in,u.rights_holder_id,receipt_in);
 UPDATE founding_units SET successor_id=successor,holder_version=holder_version+1,holder_capacity=capacity_in,
 rights_holder_id=CASE WHEN capacity_in='designated_successor' THEN successor ELSE rights_holder_id END WHERE id=u.id;
 UPDATE actors SET roles=array_append(roles,'member') WHERE id=successor AND realm='simulation' AND NOT 'member'=ANY(roles);
EXCEPTION WHEN unique_violation THEN
 -- Two distinct units cannot race to give one person two votes in this roll.
 RAISE EXCEPTION 'SUCCESSION_VOTE_COLLISION';
END $$;

CREATE FUNCTION simulation_retired_member(record_in uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT context_realm()='simulation' AND EXISTS(
  SELECT 1 FROM case_records c LEFT JOIN resolution_links l ON l.resolution_id=c.id
  WHERE c.id=record_in AND c.realm='simulation' AND c.kind IN ('association','resolution')
  AND EXISTS(SELECT 1 FROM unit_successions s WHERE s.association_id=CASE WHEN c.kind='association' THEN c.id ELSE l.association_id END AND s.predecessor_id=context_subject())
  AND NOT EXISTS(SELECT 1 FROM founding_units u WHERE u.association_id=CASE WHEN c.kind='association' THEN c.id ELSE l.association_id END AND u.active AND COALESCE(u.successor_id,u.person_id)=context_subject())
 )
$$;
CREATE OR REPLACE FUNCTION readable_record(record uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(
  SELECT 1 FROM case_records c JOIN actors reader ON reader.id=context_subject() AND reader.realm=c.realm
  WHERE c.id=record AND c.realm=context_realm() AND NOT c.id=ANY(reader.conflicts) AND (
   (NOT simulation_retired_member(c.id) AND (
    c.owner_id=reader.id
    OR EXISTS(SELECT 1 FROM grants g WHERE g.record_id=c.id AND g.realm=c.realm AND g.subject_id=reader.id AND g.revoked_at IS NULL AND g.expires_at>now() AND 'read'=ANY(g.permissions))
   ))
   OR (reader.assurance='privileged' AND reader.institution_id=c.institution_id AND c.id=ANY(reader.assignments) AND reader.roles && ARRAY['labor','commerce','state','supervisor','adjudicator','fiscal','auditor','support']::text[])
   OR simulation_member_record(c.id)
  )
 )
$$;
DROP POLICY units_read ON founding_units;
CREATE POLICY units_read ON founding_units FOR SELECT USING(realm=context_realm() AND readable_record(association_id));

CREATE OR REPLACE FUNCTION simulation_persona(persona text) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT id FROM actors WHERE realm='simulation' AND issuer='cornerstone:synthetic-development'
 AND subject=persona AND persona=ANY(ARRAY['participant','member','successor','labor','commerce','state','supervisor','fiscal','adjudicator','support'])
$$;
REVOKE ALL ON unit_successions FROM PUBLIC;
GRANT SELECT ON unit_successions TO cornerstone_runtime;
REVOKE ALL ON FUNCTION initialize_unit_holder(),simulation_succession_context(uuid,uuid),simulation_transfer_unit(uuid,uuid,integer,uuid,text,text,uuid),simulation_retired_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation_succession_context(uuid,uuid),simulation_transfer_unit(uuid,uuid,integer,uuid,text,text,uuid),simulation_retired_member(uuid) TO cornerstone_runtime;
