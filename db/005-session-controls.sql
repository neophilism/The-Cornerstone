-- Self-service revocation; this does not establish device authority or identity recovery.
ALTER TABLE sessions ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX sessions_public_id ON sessions(id);
CREATE INDEX sessions_actor_active ON sessions(actor_id,authenticated_at DESC) WHERE revoked_at IS NULL;
CREATE TABLE session_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES actors,
 session_id uuid NOT NULL REFERENCES sessions(id), action text NOT NULL CHECK(action='revoked'),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id,action)
);
ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_events FORCE ROW LEVEL SECURITY;
CREATE FUNCTION valid_actor_context() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM actors WHERE id=context_subject() AND realm=context_realm())
$$;
CREATE POLICY session_event_read ON session_events FOR SELECT USING(actor_id=context_subject() AND valid_actor_context());
REVOKE ALL ON session_events FROM PUBLIC;
CREATE FUNCTION auth_sessions(token_in text) RETURNS TABLE(id uuid,authenticated_at timestamptz,expires_at timestamptz,current_session boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT s.id,s.authenticated_at,s.expires_at,s.token_hash=token_in
 FROM sessions s JOIN sessions active ON active.token_hash=token_in AND active.revoked_at IS NULL AND active.expires_at>now()
 WHERE s.actor_id=active.actor_id AND s.revoked_at IS NULL AND s.expires_at>now()
 ORDER BY s.authenticated_at DESC,s.id LIMIT 100
$$;
CREATE FUNCTION auth_revoke_session(token_in text,id_in uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE subject uuid; changed integer;
BEGIN
 SELECT actor_id INTO subject FROM sessions WHERE token_hash=token_in AND revoked_at IS NULL AND expires_at>now();
 IF NOT FOUND THEN RETURN false; END IF;
 WITH revoked AS (
  UPDATE sessions SET revoked_at=now() WHERE id=id_in AND actor_id=subject AND revoked_at IS NULL RETURNING id,actor_id
 ) INSERT INTO session_events(actor_id,session_id,action) SELECT actor_id,id,'revoked' FROM revoked ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed>0;
END $$;
CREATE FUNCTION auth_revoke_others(token_in text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE subject uuid; changed integer;
BEGIN
 SELECT actor_id INTO subject FROM sessions WHERE token_hash=token_in AND revoked_at IS NULL AND expires_at>now();
 IF NOT FOUND THEN RETURN 0; END IF;
 WITH revoked AS (
  UPDATE sessions SET revoked_at=now() WHERE actor_id=subject AND token_hash<>token_in AND revoked_at IS NULL AND expires_at>now() RETURNING id,actor_id
 ) INSERT INTO session_events(actor_id,session_id,action) SELECT actor_id,id,'revoked' FROM revoked ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed;
END $$;
CREATE OR REPLACE FUNCTION auth_logout(token_in text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH revoked AS (UPDATE sessions SET revoked_at=now() WHERE token_hash=token_in AND revoked_at IS NULL RETURNING id,actor_id)
 INSERT INTO session_events(actor_id,session_id,action) SELECT actor_id,id,'revoked' FROM revoked ON CONFLICT DO NOTHING
$$;
CREATE TRIGGER immutable_session_events BEFORE UPDATE OR DELETE ON session_events FOR EACH ROW EXECUTE FUNCTION immutable_record();
REVOKE ALL ON FUNCTION auth_sessions(text),auth_revoke_session(text,uuid),auth_revoke_others(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION valid_actor_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION valid_actor_context() TO cornerstone_runtime;
GRANT EXECUTE ON FUNCTION auth_sessions(text),auth_revoke_session(text,uuid),auth_revoke_others(text) TO cornerstone_runtime;
GRANT SELECT ON session_events TO cornerstone_runtime;
