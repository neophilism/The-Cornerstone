-- Personal consent, scoped membership and private member ballots in simulation only.
-- This migration does not appoint officials, verify identities or activate the program.
CREATE TABLE founding_invitations (
 id uuid PRIMARY KEY, realm text NOT NULL CHECK(realm='simulation'),
 association_id uuid NOT NULL REFERENCES case_records,
 claim_id uuid NOT NULL REFERENCES case_records, person_id uuid NOT NULL REFERENCES actors,
 terms_digest text NOT NULL CHECK(terms_digest ~ '^[a-f0-9]{64}$'),
 closes_on date NOT NULL, response text NOT NULL DEFAULT 'pending' CHECK(response IN ('pending','accepted','declined')),
 responded_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(association_id,claim_id), UNIQUE(association_id,person_id)
);
CREATE TABLE resolution_links (
 resolution_id uuid PRIMARY KEY REFERENCES case_records,
 realm text NOT NULL CHECK(realm='simulation'), association_id uuid NOT NULL REFERENCES case_records,
 opened_at timestamptz, closes_on date, unit_count integer,
 roll_digest text CHECK(roll_digest ~ '^[a-f0-9]{64}$'),
 CHECK((opened_at IS NULL AND closes_on IS NULL AND unit_count IS NULL AND roll_digest IS NULL)
 OR (opened_at IS NOT NULL AND closes_on IS NOT NULL AND unit_count>=2 AND roll_digest IS NOT NULL))
);
CREATE TABLE resolution_roll (
 resolution_id uuid NOT NULL REFERENCES resolution_links, realm text NOT NULL CHECK(realm='simulation'),
 unit_id uuid NOT NULL REFERENCES founding_units, PRIMARY KEY(resolution_id,unit_id)
);
ALTER TABLE ballots ADD COLUMN choice_commitment text CHECK(choice_commitment ~ '^[a-f0-9]{64}$');
ALTER TABLE ballots ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
CREATE TRIGGER immutable_ballots BEFORE UPDATE OR DELETE ON ballots FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_resolution_roll BEFORE UPDATE OR DELETE ON resolution_roll FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE INDEX invitations_person ON founding_invitations(person_id,association_id);
CREATE INDEX resolutions_association ON resolution_links(association_id);

CREATE FUNCTION simulation_member_record(record_in uuid) RETURNS boolean
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
  )
 )
$$;
CREATE OR REPLACE FUNCTION readable_record(record uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
SELECT EXISTS(
 SELECT 1 FROM case_records c JOIN actors reader ON reader.id=context_subject() AND reader.realm=c.realm
 WHERE c.id=record AND c.realm=context_realm() AND NOT c.id=ANY(reader.conflicts)
 AND (
  c.owner_id=reader.id
  OR EXISTS(SELECT 1 FROM grants g WHERE g.record_id=c.id AND g.realm=c.realm AND g.subject_id=reader.id AND g.revoked_at IS NULL AND g.expires_at>now() AND 'read'=ANY(g.permissions))
  OR (reader.assurance='privileged' AND reader.institution_id=c.institution_id AND c.id=ANY(reader.assignments) AND reader.roles && ARRAY['labor','commerce','state','supervisor','adjudicator','fiscal','auditor','support']::text[])
  OR simulation_member_record(c.id)
 )
)
$$;
CREATE FUNCTION simulation_member_scopes() RETURNS TABLE(subject_id uuid,record_id uuid,permissions text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT context_subject(),c.id,
 CASE WHEN c.kind='resolution' AND c.state='voting' THEN ARRAY['read','record_vote']::text[] ELSE ARRAY['read']::text[] END
 FROM case_records c WHERE simulation_member_record(c.id)
$$;

ALTER TABLE founding_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE founding_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitations_read ON founding_invitations FOR SELECT USING(realm=context_realm() AND readable_record(association_id) AND (
 person_id=context_subject() OR EXISTS(SELECT 1 FROM case_records c WHERE c.id=association_id AND (c.owner_id=context_subject() OR c.institution_id IS NOT NULL AND EXISTS(SELECT 1 FROM actors a WHERE a.id=context_subject() AND a.assurance='privileged' AND 'labor'=ANY(a.roles) AND a.institution_id=c.institution_id AND c.id=ANY(a.assignments) AND NOT c.id=ANY(a.conflicts))))
));
ALTER TABLE resolution_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE resolution_links FORCE ROW LEVEL SECURITY;
CREATE POLICY resolution_links_read ON resolution_links FOR SELECT USING(realm=context_realm() AND readable_record(resolution_id));
ALTER TABLE resolution_roll ENABLE ROW LEVEL SECURITY;
ALTER TABLE resolution_roll FORCE ROW LEVEL SECURITY;
CREATE POLICY resolution_roll_read ON resolution_roll FOR SELECT USING(realm=context_realm() AND readable_record(resolution_id));
CREATE POLICY ballots_read ON ballots FOR SELECT USING(realm=context_realm() AND readable_record(resolution_id) AND (
 EXISTS(SELECT 1 FROM founding_units u WHERE u.id=unit_id AND u.active AND COALESCE(u.successor_id,u.person_id)=context_subject())
 OR EXISTS(SELECT 1 FROM case_records c JOIN actors a ON a.id=context_subject() AND a.realm=c.realm WHERE c.id=resolution_id AND a.assurance='privileged' AND 'labor'=ANY(a.roles) AND a.institution_id=c.institution_id AND c.id=ANY(a.assignments) AND NOT c.id=ANY(a.conflicts))
));

CREATE FUNCTION simulation_invite_founders(association_in uuid,units_in jsonb,digest_in text,closes_in date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u jsonb; claim uuid; person uuid; BEGIN
 IF context_realm()<>'simulation' OR digest_in IS NULL OR digest_in !~ '^[a-f0-9]{64}$' OR closes_in IS NULL
 OR jsonb_typeof(units_in)<>'array' OR jsonb_array_length(units_in) NOT BETWEEN 2 AND 2500
 OR NOT EXISTS(SELECT 1 FROM case_records c JOIN actors a ON a.id=context_subject() WHERE c.id=association_in AND c.realm='simulation' AND c.kind='association' AND c.state='submitted' AND c.owner_id=a.id AND a.realm=c.realm AND NOT c.id=ANY(a.conflicts))
 THEN RAISE EXCEPTION 'Valid submitted synthetic association owner and bounded roll required'; END IF;
 FOR u IN SELECT * FROM jsonb_array_elements(units_in) LOOP
  claim := (u->>'claimId')::uuid; person := (u->>'personId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM case_records c JOIN actors a ON a.id=person AND a.realm=c.realm WHERE c.id=claim AND c.realm='simulation' AND c.kind='claim' AND c.state='eligible' AND c.owner_id=person)
  OR EXISTS(SELECT 1 FROM founding_units f WHERE f.claim_id=claim AND f.active)
  THEN RAISE EXCEPTION 'Eligible actual claimant without another active founding roll required'; END IF;
  INSERT INTO founding_invitations(id,realm,association_id,claim_id,person_id,terms_digest,closes_on)
  VALUES(gen_random_uuid(),'simulation',association_in,claim,person,digest_in,closes_in);
 END LOOP;
END $$;
CREATE FUNCTION simulation_respond_invitation(invitation_in uuid,response_in text,digest_in text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF context_realm()<>'simulation' OR response_in IS NULL OR response_in NOT IN ('accepted','declined')
 OR NOT EXISTS(SELECT 1 FROM founding_invitations i JOIN case_records c ON c.id=i.association_id JOIN actors a ON a.id=context_subject() AND a.realm=i.realm
 WHERE i.id=invitation_in AND i.person_id=a.id AND i.terms_digest=digest_in AND i.closes_on>=CURRENT_DATE AND c.realm='simulation' AND c.state IN ('submitted','review') AND NOT c.id=ANY(a.conflicts))
 THEN RAISE EXCEPTION 'Own open founding invitation and unchanged terms required'; END IF;
 UPDATE founding_invitations SET response=response_in,responded_at=now() WHERE id=invitation_in AND person_id=context_subject();
END $$;
CREATE OR REPLACE FUNCTION register_founding_unit(unit_in uuid,realm_in text,association_in uuid,claim_in uuid,person_in uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF realm_in<>'simulation' OR context_realm()<>'simulation' OR NOT EXISTS(SELECT 1 FROM actors a JOIN case_records c ON c.id=association_in WHERE a.id=context_subject() AND a.realm='simulation' AND 'labor'=ANY(a.roles) AND a.assurance='privileged' AND c.realm='simulation' AND c.kind='association' AND c.state='review' AND a.institution_id=c.institution_id AND c.id=ANY(a.assignments) AND NOT c.id=ANY(a.conflicts)) THEN RAISE EXCEPTION 'Assigned unconflicted Labor reviewer required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM case_records c WHERE c.id=claim_in AND c.realm='simulation' AND c.kind='claim' AND c.state='eligible' AND c.owner_id=person_in)
 OR NOT EXISTS(SELECT 1 FROM founding_invitations i WHERE i.association_id=association_in AND i.claim_id=claim_in AND i.person_id=person_in AND i.response='accepted')
 THEN RAISE EXCEPTION 'Eligible claim, actual claimant and personal founding consent required'; END IF;
 INSERT INTO founding_units(id,realm,association_id,claim_id,person_id) VALUES(unit_in,realm_in,association_in,claim_in,person_in);
 UPDATE actors SET roles=array_append(roles,'member') WHERE id=person_in AND realm='simulation' AND NOT 'member'=ANY(roles);
END $$;
CREATE FUNCTION simulation_link_resolution(resolution_in uuid,association_in uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF context_realm()<>'simulation' OR NOT EXISTS(
 SELECT 1 FROM case_records r JOIN case_records a ON a.id=association_in JOIN actors reader ON reader.id=context_subject() AND reader.realm=r.realm
 JOIN founding_units u ON u.association_id=a.id AND u.active AND COALESCE(u.successor_id,u.person_id)=reader.id
 WHERE r.id=resolution_in AND r.kind='resolution' AND r.state='draft' AND r.owner_id=reader.id AND r.realm='simulation' AND a.realm=r.realm AND a.kind='association' AND a.state IN ('ready','provisional','operating') AND 'member'=ANY(reader.roles) AND NOT r.id=ANY(reader.conflicts) AND NOT a.id=ANY(reader.conflicts))
 THEN RAISE EXCEPTION 'Active founding member and own draft resolution required'; END IF;
 INSERT INTO resolution_links(resolution_id,realm,association_id) VALUES(resolution_in,'simulation',association_in);
END $$;
CREATE FUNCTION simulation_freeze_resolution(resolution_in uuid,closes_in date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer; roll_hash text; BEGIN
 IF context_realm()<>'simulation' OR closes_in IS NULL OR closes_in<CURRENT_DATE OR NOT EXISTS(
 SELECT 1 FROM resolution_links l JOIN case_records r ON r.id=l.resolution_id JOIN case_records a ON a.id=l.association_id
 JOIN actors reader ON reader.id=context_subject() AND reader.realm=r.realm JOIN founding_units u ON u.association_id=a.id AND u.active AND COALESCE(u.successor_id,u.person_id)=reader.id
 WHERE l.resolution_id=resolution_in AND l.opened_at IS NULL AND r.kind='resolution' AND r.state='draft' AND r.owner_id=reader.id AND r.realm='simulation' AND a.state IN ('ready','provisional','operating') AND 'member'=ANY(reader.roles) AND NOT r.id=ANY(reader.conflicts) AND NOT a.id=ANY(reader.conflicts))
 THEN RAISE EXCEPTION 'Own unopened member resolution, active membership and valid closing date required'; END IF;
 INSERT INTO resolution_roll(resolution_id,realm,unit_id)
 SELECT l.resolution_id,l.realm,u.id FROM resolution_links l JOIN founding_units u ON u.association_id=l.association_id AND u.active WHERE l.resolution_id=resolution_in;
 SELECT count(*)::int,encode(digest(string_agg(unit_id::text,',' ORDER BY unit_id),'sha256'),'hex') INTO n,roll_hash FROM resolution_roll WHERE resolution_id=resolution_in;
 IF n<2 THEN RAISE EXCEPTION 'At least two frozen founding units required'; END IF;
 UPDATE resolution_links SET opened_at=now(),closes_on=closes_in,unit_count=n,roll_digest=roll_hash WHERE resolution_id=resolution_in;
END $$;
CREATE FUNCTION simulation_cast_ballot(ballot_in uuid,resolution_in uuid,unit_in uuid,choice_in jsonb,commitment_in text,receipt_in uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF context_realm()<>'simulation' OR jsonb_typeof(choice_in)<>'object' OR octet_length(choice_in::text)>4000 OR commitment_in IS NULL OR commitment_in !~ '^[a-f0-9]{64}$'
 OR NOT EXISTS(SELECT 1 FROM resolution_links l JOIN case_records c ON c.id=l.resolution_id
 JOIN resolution_roll f ON f.resolution_id=c.id AND f.unit_id=unit_in JOIN founding_units u ON u.id=f.unit_id AND u.association_id=l.association_id AND u.active
 JOIN case_records association ON association.id=l.association_id
 JOIN actors a ON a.id=context_subject() AND a.realm=c.realm
 JOIN receipts r ON r.id=receipt_in AND r.record_id=c.id AND r.version=c.version AND r.actor_id=a.id AND r.action='record_vote'
 WHERE c.id=resolution_in AND c.realm='simulation' AND c.kind='resolution' AND c.state='voting' AND l.closes_on>=CURRENT_DATE AND COALESCE(u.successor_id,u.person_id)=a.id AND 'member'=ANY(a.roles) AND NOT c.id=ANY(a.conflicts) AND NOT association.id=ANY(a.conflicts))
 THEN RAISE EXCEPTION 'Own active frozen founding unit, open vote and bound receipt required'; END IF;
 INSERT INTO ballots(id,realm,resolution_id,unit_id,choice_cipher,choice_commitment,receipt_id)
 VALUES(ballot_in,'simulation',resolution_in,unit_in,choice_in,commitment_in,receipt_in);
END $$;

REVOKE ALL ON founding_invitations,resolution_links,resolution_roll FROM PUBLIC;
GRANT SELECT ON founding_invitations,resolution_links,resolution_roll,ballots TO cornerstone_runtime;
REVOKE ALL ON FUNCTION simulation_member_record(uuid),simulation_member_scopes(),simulation_invite_founders(uuid,jsonb,text,date),simulation_respond_invitation(uuid,text,text),simulation_link_resolution(uuid,uuid),simulation_freeze_resolution(uuid,date),simulation_cast_ballot(uuid,uuid,uuid,jsonb,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation_member_record(uuid),simulation_member_scopes(),simulation_invite_founders(uuid,jsonb,text,date),simulation_respond_invitation(uuid,text,text),simulation_link_resolution(uuid,uuid),simulation_freeze_resolution(uuid,date),simulation_cast_ballot(uuid,uuid,uuid,jsonb,text,uuid) TO cornerstone_runtime;
