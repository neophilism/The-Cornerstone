-- Scoped in-app updates; no email, legal notice, consent or official acceptance.
-- Invitees receive the founding submission; active members receive closure and open/tallied decisions.
-- Individual founding responses and ballots are not broadcast to the entire membership.
CREATE OR REPLACE FUNCTION deliver_activity_event(event_in uuid,token_in uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE event_row outbox%ROWTYPE; inserted integer;
BEGIN
 SELECT * INTO event_row FROM outbox WHERE id=event_in AND realm='simulation' AND event_type='record_changed' AND state='leased' AND lease_token=token_in AND leased_until>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'LEASE_LOST'; END IF;
 INSERT INTO activity_notifications(realm,recipient_id,record_id,receipt_id,record_version,action)
 SELECT 'simulation',recipient,c.id,r.id,r.version,r.action FROM case_records c JOIN receipts r ON r.id=event_row.receipt_id AND r.record_id=c.id AND r.realm='simulation'
 CROSS JOIN LATERAL (
  SELECT c.owner_id AS recipient
  UNION SELECT r.actor_id
  UNION SELECT g.subject_id FROM grants g WHERE g.realm='simulation' AND g.record_id=c.id AND g.revoked_at IS NULL AND g.expires_at>now() AND 'read'=ANY(g.permissions)
  UNION SELECT reviewer.id FROM actors reviewer WHERE reviewer.realm='simulation' AND reviewer.assurance='privileged' AND reviewer.institution_id=c.institution_id AND c.id=ANY(reviewer.assignments) AND reviewer.roles && ARRAY['labor','commerce','state','supervisor','adjudicator','fiscal','auditor','support']::text[]
  UNION SELECT i.person_id FROM founding_invitations i WHERE i.association_id=c.id AND c.kind='association' AND c.state IN ('submitted','review') AND r.action='submit'
  UNION SELECT COALESCE(u.successor_id,u.person_id) FROM founding_units u WHERE u.association_id=c.id AND u.realm='simulation' AND u.active AND c.kind='association' AND c.state IN ('ready','provisional','operating') AND r.action IN ('close_roll','provisional_restoration','final_restoration')
  UNION SELECT COALESCE(u.successor_id,u.person_id) FROM resolution_links l JOIN case_records association ON association.id=l.association_id JOIN resolution_roll roll ON roll.resolution_id=l.resolution_id JOIN founding_units u ON u.id=roll.unit_id JOIN actors holder ON holder.id=COALESCE(u.successor_id,u.person_id)
   WHERE l.resolution_id=c.id AND c.kind='resolution' AND r.action IN ('open_vote','tally') AND l.opened_at IS NOT NULL AND u.realm='simulation' AND u.active AND association.realm='simulation' AND association.state IN ('ready','provisional','operating') AND NOT association.id=ANY(holder.conflicts)
 ) targets
 JOIN actors a ON a.id=targets.recipient AND a.realm='simulation'
 WHERE c.id=event_row.record_id AND c.realm='simulation' AND NOT c.id=ANY(a.conflicts)
 ON CONFLICT(receipt_id,recipient_id) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF NOT EXISTS(SELECT 1 FROM receipts r JOIN case_records c ON c.id=r.record_id WHERE r.id=event_row.receipt_id AND c.id=event_row.record_id AND c.realm='simulation' AND r.realm='simulation') THEN RAISE EXCEPTION 'DELIVERY_SOURCE_INVALID'; END IF;
 UPDATE outbox SET state='delivered',finished_at=now(),lease_token=NULL,lease_owner=NULL,leased_until=NULL,error_code=NULL WHERE id=event_in;
 RETURN inserted;
END $$;

