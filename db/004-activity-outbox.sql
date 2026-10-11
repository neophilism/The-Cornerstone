-- In-app activity only. This migration creates no legal-service or transfer status.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cornerstone_worker') THEN
  CREATE ROLE cornerstone_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cornerstone_worker' AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole)) THEN RAISE EXCEPTION 'Restricted worker role required'; END IF;
END $$;
ALTER TABLE outbox ADD COLUMN lease_token uuid, ADD COLUMN lease_owner uuid, ADD COLUMN finished_at timestamptz;
CREATE INDEX outbox_expired_lease ON outbox(leased_until) WHERE state='leased';
CREATE TABLE activity_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), realm text NOT NULL CHECK(realm='simulation'),
 recipient_id uuid NOT NULL REFERENCES actors, record_id uuid NOT NULL REFERENCES case_records,
 receipt_id uuid NOT NULL REFERENCES receipts, record_version integer NOT NULL CHECK(record_version>0),
 action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz,
 CHECK(read_at IS NULL OR read_at>=created_at), UNIQUE(receipt_id,recipient_id)
);
ALTER TABLE activity_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY activity_read ON activity_notifications FOR SELECT USING(realm=context_realm() AND recipient_id=context_subject() AND readable_record(record_id));
CREATE POLICY activity_mark_read ON activity_notifications FOR UPDATE USING(realm=context_realm() AND recipient_id=context_subject() AND readable_record(record_id)) WITH CHECK(realm=context_realm() AND recipient_id=context_subject() AND readable_record(record_id));
CREATE INDEX activity_inbox ON activity_notifications(recipient_id,created_at DESC);

CREATE FUNCTION lease_activity_events(worker uuid,batch integer) RETURNS TABLE(event_id uuid,token uuid,attempt integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF worker IS NULL OR batch IS NULL OR batch NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid worker lease request'; END IF;
 UPDATE outbox SET state='failed',error_code='RETRIES_EXHAUSTED',lease_token=NULL,lease_owner=NULL,leased_until=NULL,finished_at=now()
 WHERE realm='simulation' AND event_type='record_changed' AND state='leased' AND leased_until<=now() AND attempts>=8;
 RETURN QUERY WITH candidates AS (
  SELECT o.id FROM outbox o WHERE o.realm='simulation' AND o.event_type='record_changed' AND o.attempts<8 AND
  ((o.state IN ('pending','failed') AND o.available_at<=now()) OR (o.state='leased' AND o.leased_until<=now()))
  ORDER BY o.available_at,o.id LIMIT batch FOR UPDATE SKIP LOCKED
 ) UPDATE outbox o SET state='leased',attempts=o.attempts+1,lease_token=gen_random_uuid(),lease_owner=worker,leased_until=now()+interval '60 seconds',error_code=NULL
 FROM candidates c WHERE o.id=c.id RETURNING o.id,o.lease_token,o.attempts;
END $$;

CREATE FUNCTION deliver_activity_event(event_in uuid,token_in uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE event_row outbox%ROWTYPE; inserted integer;
BEGIN
 SELECT * INTO event_row FROM outbox WHERE id=event_in AND realm='simulation' AND event_type='record_changed' AND state='leased' AND lease_token=token_in AND leased_until>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'LEASE_LOST'; END IF;
 INSERT INTO activity_notifications(realm,recipient_id,record_id,receipt_id,record_version,action)
 SELECT 'simulation',recipient,c.id,r.id,r.version,r.action FROM case_records c JOIN receipts r ON r.id=event_row.receipt_id AND r.record_id=c.id AND r.realm='simulation'
 CROSS JOIN LATERAL (SELECT c.owner_id AS recipient UNION SELECT r.actor_id) targets
 JOIN actors a ON a.id=targets.recipient AND a.realm='simulation'
 WHERE c.id=event_row.record_id AND c.realm='simulation'
 ON CONFLICT(receipt_id,recipient_id) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF NOT EXISTS(SELECT 1 FROM activity_notifications WHERE receipt_id=event_row.receipt_id) THEN RAISE EXCEPTION 'DELIVERY_SOURCE_INVALID'; END IF;
 UPDATE outbox SET state='delivered',finished_at=now(),lease_token=NULL,lease_owner=NULL,leased_until=NULL,error_code=NULL WHERE id=event_in;
 RETURN inserted;
END $$;

CREATE FUNCTION fail_activity_event(event_in uuid,token_in uuid,code_in text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF code_in IS NULL OR code_in NOT IN ('DELIVERY_ERROR','WORKER_INTERRUPTED') THEN RAISE EXCEPTION 'Invalid diagnostic code'; END IF;
 UPDATE outbox SET state='failed',error_code=CASE WHEN attempts>=8 THEN 'RETRIES_EXHAUSTED' ELSE code_in END,
 available_at=now()+least(256,power(2,attempts)) * interval '1 second',lease_token=NULL,lease_owner=NULL,leased_until=NULL,
 finished_at=CASE WHEN attempts>=8 THEN now() ELSE NULL END
 WHERE id=event_in AND realm='simulation' AND event_type='record_changed' AND state='leased' AND lease_token=token_in AND leased_until>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'LEASE_LOST'; END IF;
END $$;
REVOKE ALL ON activity_notifications FROM PUBLIC;
REVOKE ALL ON FUNCTION lease_activity_events(uuid,integer),deliver_activity_event(uuid,uuid),fail_activity_event(uuid,uuid,text) FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO cornerstone_worker;
GRANT EXECUTE ON FUNCTION lease_activity_events(uuid,integer),deliver_activity_event(uuid,uuid),fail_activity_event(uuid,uuid,text) TO cornerstone_worker;
GRANT SELECT ON activity_notifications TO cornerstone_runtime;
GRANT UPDATE(read_at) ON activity_notifications TO cornerstone_runtime;
