-- Synthetic calculation-appeal assignment. This does not serve a legal notice.
CREATE FUNCTION simulation_route_financial_review(record_in uuid,version_in integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_record case_records%ROWTYPE; institution uuid; assigned_count integer;
BEGIN
 IF context_realm()<>'simulation' OR NOT valid_actor_context() THEN
  RAISE EXCEPTION 'A synthetic actor context is required';
 END IF;
 SELECT c.* INTO current_record FROM case_records c JOIN actors a ON a.id=context_subject()
 WHERE c.id=record_in AND c.realm='simulation' AND c.kind='financial_schedule'
  AND c.state='calculated' AND c.version=version_in AND c.owner_id=a.id
  AND a.realm=c.realm AND 'member'=ANY(a.roles) AND NOT c.id=ANY(a.conflicts)
 FOR UPDATE OF c;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM receipts WHERE record_id=record_in
   AND realm='simulation' AND action IN ('calculate','correct')) THEN
  RAISE EXCEPTION 'The owner of a currently calculated synthetic schedule is required';
 END IF;
 SELECT institution_id INTO institution FROM simulation_routing
 WHERE kind='hearing' AND 'adjudicator'=ANY(roles);
 IF institution IS NULL OR institution=current_record.institution_id THEN
  RAISE EXCEPTION 'FINANCIAL_REVIEW_ROUTE_UNAVAILABLE';
 END IF;
 UPDATE actors a SET assignments=CASE WHEN record_in=ANY(a.assignments)
   THEN a.assignments ELSE array_append(a.assignments,record_in) END
 WHERE a.realm='simulation' AND a.institution_id=institution
  AND a.assurance='privileged' AND 'adjudicator'=ANY(a.roles)
  AND a.id<>current_record.owner_id AND NOT record_in=ANY(a.conflicts)
  AND NOT EXISTS(SELECT 1 FROM receipts r WHERE r.record_id=record_in AND r.actor_id=a.id
    AND r.action IN ('calculate','correct'));
 GET DIAGNOSTICS assigned_count=ROW_COUNT;
 IF assigned_count=0 THEN RAISE EXCEPTION 'FINANCIAL_REVIEWER_UNAVAILABLE'; END IF;
 RETURN institution;
END $$;
REVOKE ALL ON FUNCTION simulation_route_financial_review(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation_route_financial_review(uuid,integer) TO cornerstone_runtime;

-- Re-read staff standing in the database; a cached request Actor cannot retain a removed role.
CREATE FUNCTION simulation_financial_reviewer(record_in uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT context_realm()='simulation' AND valid_actor_context() AND EXISTS(
  SELECT 1 FROM case_records c JOIN actors a ON a.id=context_subject()
  WHERE c.id=record_in AND c.realm='simulation' AND c.kind='financial_schedule'
   AND c.state IN ('review_requested','calculation_review','calculation_heard')
   AND a.realm=c.realm AND a.assurance='privileged' AND 'adjudicator'=ANY(a.roles)
   AND a.institution_id=c.institution_id AND a.id<>c.owner_id
   AND c.id=ANY(a.assignments) AND NOT c.id=ANY(a.conflicts)
   AND NOT EXISTS(SELECT 1 FROM receipts r WHERE r.record_id=c.id AND r.actor_id=a.id
    AND r.action IN ('calculate','correct'))
 )
$$;
CREATE FUNCTION simulation_financial_evidence_writer(record_in uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT context_realm()='simulation' AND valid_actor_context() AND EXISTS(
  SELECT 1 FROM case_records c JOIN actors a ON a.id=context_subject()
  WHERE c.id=record_in AND c.realm='simulation' AND c.kind='financial_schedule'
   AND c.state IN ('review_requested','calculation_review') AND a.realm=c.realm
   AND NOT c.id=ANY(a.conflicts)
   AND ((a.id=c.owner_id AND 'member'=ANY(a.roles)) OR simulation_financial_reviewer(c.id))
 )
$$;
REVOKE ALL ON FUNCTION simulation_financial_reviewer(uuid),simulation_financial_evidence_writer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation_financial_reviewer(uuid),simulation_financial_evidence_writer(uuid) TO cornerstone_runtime;
