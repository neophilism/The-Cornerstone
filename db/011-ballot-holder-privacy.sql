-- A founding unit's current holder may know whether its vote has been used,
-- but does not inherit a predecessor's private choice. Synthetic adapter only.
DROP POLICY ballots_read ON ballots;
CREATE POLICY ballots_read ON ballots FOR SELECT USING(
 realm=context_realm() AND readable_record(resolution_id) AND (
  EXISTS(SELECT 1 FROM receipts r WHERE r.id=receipt_id AND r.realm=ballots.realm AND r.actor_id=context_subject())
  OR simulation_assigned_labor(resolution_id)
 )
);

CREATE FUNCTION simulation_ballot_status(resolution_in uuid)
RETURNS TABLE(unit_id uuid,cast_already boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT u.id,EXISTS(SELECT 1 FROM ballots b WHERE b.resolution_id=l.resolution_id AND b.unit_id=u.id)
 FROM resolution_links l JOIN case_records c ON c.id=l.resolution_id
 JOIN case_records association ON association.id=l.association_id
 JOIN actors a ON a.id=context_subject() AND a.realm=c.realm
 JOIN founding_units u ON u.association_id=association.id AND u.active AND COALESCE(u.successor_id,u.person_id)=a.id
 JOIN resolution_roll f ON f.resolution_id=c.id AND f.unit_id=u.id
 WHERE context_realm()='simulation' AND c.id=resolution_in AND c.realm='simulation'
 AND c.kind='resolution' AND c.state IN ('voting','tallied')
 AND association.realm=c.realm AND association.state IN ('ready','provisional','operating')
 AND NOT c.id=ANY(a.conflicts) AND NOT association.id=ANY(a.conflicts)
 AND readable_record(c.id)
 ORDER BY u.id
$$;

CREATE FUNCTION simulation_lock_voting_unit(resolution_in uuid,unit_in uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 -- Check before locking so an unrelated reference cannot lock another unit.
 IF NOT EXISTS(SELECT 1 FROM simulation_ballot_status(resolution_in) s WHERE s.unit_id=unit_in)
 THEN RAISE EXCEPTION 'UNIT_AUTHORITY'; END IF;
 PERFORM 1 FROM founding_units WHERE id=unit_in FOR UPDATE;
 -- A transfer may have committed while this transaction waited for the lock.
 IF NOT EXISTS(SELECT 1 FROM simulation_ballot_status(resolution_in) s WHERE s.unit_id=unit_in)
 THEN RAISE EXCEPTION 'UNIT_AUTHORITY'; END IF;
END $$;

CREATE OR REPLACE FUNCTION simulation_cast_ballot(ballot_in uuid,resolution_in uuid,unit_in uuid,choice_in jsonb,commitment_in text,receipt_in uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM simulation_lock_voting_unit(resolution_in,unit_in);
 IF context_realm()<>'simulation' OR choice_in IS NULL OR jsonb_typeof(choice_in)<>'object' OR octet_length(choice_in::text)>4000 OR commitment_in IS NULL OR commitment_in !~ '^[a-f0-9]{64}$'
 OR NOT EXISTS(SELECT 1 FROM resolution_links l JOIN case_records c ON c.id=l.resolution_id
 JOIN resolution_roll f ON f.resolution_id=c.id AND f.unit_id=unit_in JOIN founding_units u ON u.id=f.unit_id AND u.association_id=l.association_id AND u.active
 JOIN case_records association ON association.id=l.association_id
 JOIN actors a ON a.id=context_subject() AND a.realm=c.realm
 JOIN receipts r ON r.id=receipt_in AND r.record_id=c.id AND r.version=c.version AND r.actor_id=a.id AND r.action='record_vote'
 WHERE c.id=resolution_in AND c.realm='simulation' AND c.kind='resolution' AND c.state='voting' AND l.closes_on>=CURRENT_DATE AND COALESCE(u.successor_id,u.person_id)=a.id AND 'member'=ANY(a.roles) AND NOT c.id=ANY(a.conflicts) AND NOT association.id=ANY(a.conflicts))
 THEN RAISE EXCEPTION 'Own active frozen founding unit, open vote and bound receipt required'; END IF;
 IF EXISTS(SELECT 1 FROM ballots WHERE resolution_id=resolution_in AND unit_id=unit_in)
 THEN RAISE EXCEPTION 'DUPLICATE_BALLOT'; END IF;
 INSERT INTO ballots(id,realm,resolution_id,unit_id,choice_cipher,choice_commitment,receipt_id)
 VALUES(ballot_in,'simulation',resolution_in,unit_in,choice_in,commitment_in,receipt_in);
END $$;

REVOKE ALL ON FUNCTION simulation_ballot_status(uuid),simulation_lock_voting_unit(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation_ballot_status(uuid),simulation_lock_voting_unit(uuid,uuid) TO cornerstone_runtime;
