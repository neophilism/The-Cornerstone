-- Synthetic development support. Protected production intake cannot activate in this release.
CREATE FUNCTION simulation_actor_exists(person uuid,realm_in text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT realm_in='simulation' AND context_realm()='simulation' AND EXISTS(SELECT 1 FROM actors WHERE id=person AND realm=realm_in)
$$;
CREATE FUNCTION simulation_persona(persona text) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT id FROM actors WHERE realm='simulation' AND issuer='cornerstone:synthetic-development' AND subject=persona AND persona=ANY(ARRAY['participant','member','labor','commerce','state','supervisor','fiscal','adjudicator','support'])
$$;
CREATE FUNCTION register_founding_unit(unit_in uuid,realm_in text,association_in uuid,claim_in uuid,person_in uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF realm_in<>'simulation' OR context_realm()<>'simulation' OR NOT EXISTS(SELECT 1 FROM actors a JOIN case_records c ON c.id=association_in WHERE a.id=context_subject() AND a.realm='simulation' AND 'labor'=ANY(a.roles) AND a.assurance='privileged' AND c.realm='simulation' AND c.kind='association' AND c.state='review' AND a.institution_id=c.institution_id AND c.id=ANY(a.assignments) AND NOT c.id=ANY(a.conflicts)) THEN RAISE EXCEPTION 'Assigned unconflicted Labor reviewer required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM case_records c WHERE c.id=claim_in AND c.realm='simulation' AND c.kind='claim' AND c.state='eligible' AND c.owner_id=person_in) THEN RAISE EXCEPTION 'Eligible claim and actual claimant required'; END IF;
 INSERT INTO founding_units(id,realm,association_id,claim_id,person_id) VALUES(unit_in,realm_in,association_in,claim_in,person_in);
END $$;
CREATE TABLE simulation_routing(kind text PRIMARY KEY,institution_id uuid NOT NULL,roles text[] NOT NULL);
CREATE FUNCTION simulation_assign(record_in uuid,kind_in text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE institution uuid; BEGIN
 IF context_realm()<>'simulation' OR NOT EXISTS(SELECT 1 FROM case_records c WHERE c.id=record_in AND c.realm='simulation' AND c.kind=kind_in AND c.owner_id=context_subject()) THEN RAISE EXCEPTION 'Synthetic record owner required'; END IF;
 SELECT institution_id INTO institution FROM simulation_routing WHERE kind=kind_in;
 IF institution IS NULL THEN RETURN NULL; END IF;
 UPDATE actors a SET assignments=array_append(a.assignments,record_in) FROM simulation_routing r WHERE r.kind=kind_in AND a.realm='simulation' AND a.institution_id=r.institution_id AND a.roles&&r.roles AND a.assurance='privileged' AND NOT record_in=ANY(a.assignments) AND NOT record_in=ANY(a.conflicts);
 RETURN institution;
END $$;
REVOKE ALL ON simulation_routing FROM PUBLIC;
REVOKE ALL ON FUNCTION simulation_actor_exists(uuid,text),simulation_persona(text),register_founding_unit(uuid,text,uuid,uuid,uuid),simulation_assign(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation_actor_exists(uuid,text),simulation_persona(text),register_founding_unit(uuid,text,uuid,uuid,uuid),simulation_assign(uuid,text) TO cornerstone_runtime;
