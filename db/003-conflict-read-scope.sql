-- Narrow every private record read when the actor has a recorded conflict,
-- including owner and delegated paths. Existing data and history remain intact.
CREATE OR REPLACE FUNCTION readable_record(record uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
SELECT EXISTS(
 SELECT 1 FROM case_records c JOIN actors reader ON reader.id=context_subject() AND reader.realm=c.realm
 WHERE c.id=record AND c.realm=context_realm() AND NOT c.id=ANY(reader.conflicts)
 AND (
  c.owner_id=reader.id
  OR EXISTS(SELECT 1 FROM grants g WHERE g.record_id=c.id AND g.realm=c.realm AND g.subject_id=reader.id AND g.revoked_at IS NULL AND g.expires_at>now() AND 'read'=ANY(g.permissions))
  OR (reader.assurance='privileged' AND reader.institution_id=c.institution_id AND c.id=ANY(reader.assignments) AND reader.roles && ARRAY['labor','commerce','state','supervisor','adjudicator','fiscal','auditor','support']::text[])
 )
)
$$;
