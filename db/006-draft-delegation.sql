-- Capability check returns no profile or directory entry.
CREATE FUNCTION simulation_delegate_ok(record_in uuid,subject_in uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT context_realm()='simulation' AND subject_in<>context_subject() AND EXISTS(
  SELECT 1 FROM case_records c JOIN actors target ON target.id=subject_in AND target.realm=c.realm
  JOIN actors owner ON owner.id=context_subject() AND owner.realm=c.realm
  WHERE c.id=record_in AND c.realm='simulation' AND c.owner_id=owner.id
  AND NOT c.id=ANY(owner.conflicts) AND NOT c.id=ANY(target.conflicts)
  AND target.roles && ARRAY['participant','representative']::text[]
 )
$$;
REVOKE ALL ON FUNCTION simulation_delegate_ok(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation_delegate_ok(uuid,uuid) TO cornerstone_runtime;
