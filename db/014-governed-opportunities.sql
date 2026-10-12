-- Explicit member sharing of immutable synthetic planning proposals. No operating authority.
CREATE TABLE opportunity_links (
 opportunity_id uuid PRIMARY KEY REFERENCES case_records,
 realm text NOT NULL CHECK(realm='simulation'),
 association_id uuid NOT NULL REFERENCES case_records,
 proposal_version integer NOT NULL CHECK(proposal_version>0),
 proposal_digest text NOT NULL CHECK(proposal_digest ~ '^[a-f0-9]{64}$'),
 shared_receipt_id uuid NOT NULL UNIQUE REFERENCES receipts,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX opportunity_links_association ON opportunity_links(association_id);
CREATE TRIGGER immutable_opportunity_links BEFORE UPDATE OR DELETE ON opportunity_links FOR EACH ROW EXECUTE FUNCTION immutable_record();
ALTER TABLE opportunity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_links FORCE ROW LEVEL SECURITY;
CREATE POLICY opportunity_links_read ON opportunity_links FOR SELECT USING(realm=context_realm() AND readable_record(opportunity_id));
REVOKE ALL ON opportunity_links FROM PUBLIC;
GRANT SELECT ON opportunity_links TO cornerstone_runtime;

-- Lock current unit authority through the command, so succession cannot invalidate it mid-write.
CREATE FUNCTION simulation_lock_plan_member(association_in uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE unit uuid; BEGIN
 IF context_realm()<>'simulation' THEN RETURN NULL; END IF;
 SELECT u.id INTO unit FROM founding_units u
 JOIN case_records c ON c.id=u.association_id
 JOIN actors a ON a.id=context_subject() AND a.realm=c.realm
 WHERE c.id=association_in AND c.realm='simulation' AND c.kind='association'
 AND c.state IN ('ready','provisional','operating') AND NOT c.id=ANY(a.conflicts)
 AND 'member'=ANY(a.roles) AND u.active AND COALESCE(u.successor_id,u.person_id)=a.id
 FOR SHARE OF u;
 RETURN unit;
END $$;
CREATE FUNCTION simulation_share_opportunity(opportunity_in uuid,association_in uuid,version_in integer,digest_in text,receipt_in uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF simulation_lock_plan_member(association_in) IS NULL OR digest_in IS NULL OR digest_in !~ '^[a-f0-9]{64}$'
 OR NOT EXISTS(SELECT 1 FROM case_records c JOIN actors a ON a.id=context_subject() AND a.realm=c.realm
 JOIN receipts p ON p.id=receipt_in AND p.record_id=c.id AND p.realm=c.realm AND p.version=c.version
 WHERE c.id=opportunity_in AND c.realm='simulation' AND c.kind='opportunity' AND c.state='proposed'
 AND c.owner_id=a.id AND NOT c.id=ANY(a.conflicts) AND c.version=version_in AND p.action='propose' AND p.actor_id=a.id)
 THEN RAISE EXCEPTION 'A current founding member and receipted proposed plan are required'; END IF;
 INSERT INTO opportunity_links(opportunity_id,realm,association_id,proposal_version,proposal_digest,shared_receipt_id)
 VALUES(opportunity_in,'simulation',association_in,version_in,digest_in,receipt_in);
END $$;
CREATE OR REPLACE FUNCTION simulation_member_record(record_in uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT context_realm()='simulation' AND EXISTS(
  SELECT 1 FROM case_records c JOIN actors reader ON reader.id=context_subject() AND reader.realm=c.realm
  WHERE c.id=record_in AND c.realm='simulation' AND NOT c.id=ANY(reader.conflicts) AND (
   (c.kind='association' AND (
    (c.state IN ('submitted','review') AND EXISTS(SELECT 1 FROM founding_invitations i WHERE i.association_id=c.id AND i.person_id=reader.id))
    OR (c.state IN ('ready','provisional','operating') AND EXISTS(SELECT 1 FROM founding_units u WHERE u.association_id=c.id AND u.active AND COALESCE(u.successor_id,u.person_id)=reader.id))
   ))
   OR (c.kind='resolution' AND c.state IN ('voting','tallied') AND EXISTS(
    SELECT 1 FROM resolution_links l JOIN case_records a ON a.id=l.association_id JOIN founding_units u ON u.association_id=a.id
    WHERE l.resolution_id=c.id AND l.opened_at IS NOT NULL AND a.realm='simulation' AND a.state IN ('ready','provisional','operating')
    AND NOT a.id=ANY(reader.conflicts) AND u.active AND COALESCE(u.successor_id,u.person_id)=reader.id
   ))
   OR (c.kind='opportunity' AND c.state IN ('proposed','adopted','withdrawn') AND EXISTS(
    SELECT 1 FROM opportunity_links l JOIN case_records a ON a.id=l.association_id JOIN founding_units u ON u.association_id=a.id
    WHERE l.opportunity_id=c.id AND a.realm='simulation' AND a.state IN ('ready','provisional','operating')
    AND NOT a.id=ANY(reader.conflicts) AND u.active AND COALESCE(u.successor_id,u.person_id)=reader.id
   ))
  )
 )
$$;
CREATE OR REPLACE FUNCTION simulation_member_scopes() RETURNS TABLE(subject_id uuid,record_id uuid,permissions text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT context_subject(),c.id,
 CASE WHEN c.kind='resolution' AND c.state='voting' THEN ARRAY['read','record_vote']::text[]
 WHEN c.kind='opportunity' AND c.state='proposed' THEN ARRAY['read','adopt_plan']::text[]
 ELSE ARRAY['read']::text[] END
 FROM case_records c WHERE simulation_member_record(c.id)
$$;
CREATE OR REPLACE FUNCTION simulation_retired_member(record_in uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT context_realm()='simulation' AND EXISTS(
  SELECT 1 FROM case_records c LEFT JOIN resolution_links l ON l.resolution_id=c.id LEFT JOIN opportunity_links p ON p.opportunity_id=c.id
  WHERE c.id=record_in AND c.realm='simulation' AND c.kind IN ('association','resolution','opportunity')
  AND EXISTS(SELECT 1 FROM unit_successions s WHERE s.association_id=CASE WHEN c.kind='association' THEN c.id ELSE COALESCE(l.association_id,p.association_id) END AND s.predecessor_id=context_subject())
  AND NOT EXISTS(SELECT 1 FROM founding_units u WHERE u.association_id=CASE WHEN c.kind='association' THEN c.id ELSE COALESCE(l.association_id,p.association_id) END AND u.active AND COALESCE(u.successor_id,u.person_id)=context_subject())
 )
$$;
INSERT INTO simulation_routing(kind,institution_id,roles)
 SELECT 'opportunity',institution_id,roles FROM simulation_routing WHERE kind='association'
 ON CONFLICT(kind) DO NOTHING;
REVOKE ALL ON FUNCTION simulation_lock_plan_member(uuid),simulation_share_opportunity(uuid,uuid,integer,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation_lock_plan_member(uuid),simulation_share_opportunity(uuid,uuid,integer,text,uuid) TO cornerstone_runtime;
