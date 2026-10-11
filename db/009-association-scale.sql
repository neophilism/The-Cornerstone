-- Synthetic personal approval of larger association scale. No production authority.
CREATE TABLE founding_scale_votes (
 invitation_id uuid PRIMARY KEY REFERENCES founding_invitations,
 realm text NOT NULL CHECK(realm='simulation'),
 association_id uuid NOT NULL REFERENCES case_records,
 person_id uuid NOT NULL REFERENCES actors,
 choice_cipher jsonb NOT NULL,
 commitment text NOT NULL CHECK(commitment ~ '^[a-f0-9]{64}$'),
 receipt_id uuid NOT NULL REFERENCES receipts,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE founding_scale_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE founding_scale_votes FORCE ROW LEVEL SECURITY;
CREATE POLICY scale_votes_read ON founding_scale_votes FOR SELECT USING(
 realm=context_realm() AND readable_record(association_id)
 AND (person_id=context_subject() OR simulation_assigned_labor(association_id))
);
CREATE TABLE founding_scale_history (
 receipt_id uuid PRIMARY KEY REFERENCES receipts,
 invitation_id uuid NOT NULL REFERENCES founding_invitations,
 realm text NOT NULL CHECK(realm='simulation'),
 association_id uuid NOT NULL REFERENCES case_records,
 person_id uuid NOT NULL REFERENCES actors,
 choice_cipher jsonb NOT NULL,
 commitment text NOT NULL CHECK(commitment ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE founding_scale_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE founding_scale_history FORCE ROW LEVEL SECURITY;
CREATE POLICY scale_history_read ON founding_scale_history FOR SELECT USING(
 realm=context_realm() AND readable_record(association_id)
 AND (person_id=context_subject() OR simulation_assigned_labor(association_id))
);
CREATE TRIGGER immutable_scale_history BEFORE UPDATE OR DELETE ON founding_scale_history FOR EACH ROW EXECUTE FUNCTION immutable_record();

CREATE FUNCTION simulation_record_scale_vote(invitation_in uuid,cipher_in jsonb,commitment_in text,receipt_in uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE invitation founding_invitations; BEGIN
 SELECT i.* INTO invitation FROM founding_invitations i JOIN case_records c ON c.id=i.association_id
 JOIN actors a ON a.id=context_subject() AND a.realm=i.realm
 JOIN receipts r ON r.id=receipt_in AND r.record_id=c.id AND r.version=c.version AND r.actor_id=a.id AND r.action='founding_response'
 WHERE i.id=invitation_in AND i.person_id=a.id AND i.realm='simulation' AND c.realm=i.realm
 AND c.kind='association' AND c.state IN ('submitted','review') AND i.closes_on>=CURRENT_DATE AND NOT c.id=ANY(a.conflicts);
 IF context_realm()<>'simulation' OR invitation.id IS NULL OR jsonb_typeof(cipher_in)<>'object'
 OR octet_length(cipher_in::text)>4000 OR commitment_in IS NULL OR commitment_in !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'Own open invitation, bounded encrypted choice and bound response receipt required'; END IF;
 INSERT INTO founding_scale_history(receipt_id,invitation_id,realm,association_id,person_id,choice_cipher,commitment)
 VALUES(receipt_in,invitation.id,'simulation',invitation.association_id,invitation.person_id,cipher_in,commitment_in);
 INSERT INTO founding_scale_votes(invitation_id,realm,association_id,person_id,choice_cipher,commitment,receipt_id)
 VALUES(invitation.id,'simulation',invitation.association_id,invitation.person_id,cipher_in,commitment_in,receipt_in)
 ON CONFLICT(invitation_id) DO UPDATE SET choice_cipher=EXCLUDED.choice_cipher,commitment=EXCLUDED.commitment,receipt_id=EXCLUDED.receipt_id,updated_at=now();
END $$;
CREATE FUNCTION simulation_close_founding_units(association_in uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF context_realm()<>'simulation' OR NOT simulation_assigned_labor(association_in)
 OR NOT EXISTS(SELECT 1 FROM case_records WHERE id=association_in AND kind='association' AND state='review' AND realm='simulation')
 OR (SELECT count(*) FROM founding_invitations WHERE association_id=association_in)<2
 OR EXISTS(SELECT 1 FROM founding_invitations i LEFT JOIN case_records c ON c.id=i.claim_id LEFT JOIN actors a ON a.id=i.person_id
 WHERE i.association_id=association_in AND (i.response<>'accepted' OR c.kind<>'claim' OR c.state<>'eligible' OR c.realm<>'simulation' OR c.owner_id<>i.person_id OR a.realm<>'simulation'))
 THEN RAISE EXCEPTION 'Assigned Labor, open review and personally accepted eligible roll required'; END IF;
 INSERT INTO founding_units(id,realm,association_id,claim_id,person_id)
 SELECT gen_random_uuid(),'simulation',association_id,claim_id,person_id FROM founding_invitations WHERE association_id=association_in ORDER BY claim_id;
 UPDATE actors SET roles=array_append(roles,'member') WHERE realm='simulation' AND NOT 'member'=ANY(roles)
 AND id IN (SELECT person_id FROM founding_invitations WHERE association_id=association_in);
END $$;

-- The ordinary policy ceiling remains 2,500. A larger submitted roll does not
-- receive units until actual all-founder approval and Labor findings are checked.
CREATE OR REPLACE FUNCTION simulation_invite_founders(association_in uuid,units_in jsonb,digest_in text,closes_in date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u jsonb; claim uuid; person uuid; BEGIN
 IF context_realm()<>'simulation' OR digest_in IS NULL OR digest_in !~ '^[a-f0-9]{64}$' OR closes_in IS NULL
 OR jsonb_typeof(units_in)<>'array' OR jsonb_array_length(units_in)<2 OR octet_length(units_in::text)>1000000
 OR NOT EXISTS(SELECT 1 FROM case_records c JOIN actors a ON a.id=context_subject() WHERE c.id=association_in AND c.realm='simulation' AND c.kind='association' AND c.state='submitted' AND c.owner_id=a.id AND a.realm=c.realm AND NOT c.id=ANY(a.conflicts))
 THEN RAISE EXCEPTION 'Valid submitted synthetic association owner and bounded request required'; END IF;
 FOR u IN SELECT * FROM jsonb_array_elements(units_in) LOOP
  claim := (u->>'claimId')::uuid; person := (u->>'personId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM case_records c JOIN actors a ON a.id=person AND a.realm=c.realm WHERE c.id=claim AND c.realm='simulation' AND c.kind='claim' AND c.state='eligible' AND c.owner_id=person)
  OR EXISTS(SELECT 1 FROM founding_units f WHERE f.claim_id=claim AND f.active)
  THEN RAISE EXCEPTION 'Eligible actual claimant without another active founding roll required'; END IF;
  INSERT INTO founding_invitations(id,realm,association_id,claim_id,person_id,terms_digest,closes_on)
  VALUES(gen_random_uuid(),'simulation',association_in,claim,person,digest_in,closes_in);
 END LOOP;
END $$;
REVOKE ALL ON founding_scale_votes,founding_scale_history FROM PUBLIC;
GRANT SELECT ON founding_scale_votes,founding_scale_history TO cornerstone_runtime;
REVOKE ALL ON FUNCTION simulation_record_scale_vote(uuid,jsonb,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation_record_scale_vote(uuid,jsonb,text,uuid) TO cornerstone_runtime;
REVOKE ALL ON FUNCTION simulation_close_founding_units(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation_close_founding_units(uuid) TO cornerstone_runtime;
