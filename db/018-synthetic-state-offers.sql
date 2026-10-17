-- Synthetic preparation and intentionally disclosed offer terms only. No legal powers are activated.
CREATE TABLE simulation_state_origins (
 record_id uuid PRIMARY KEY REFERENCES case_records(id),
 actor_id uuid NOT NULL REFERENCES actors(id), institution_id uuid NOT NULL,
 jurisdiction text NOT NULL, receipt_id uuid NOT NULL REFERENCES receipts(id)
);
CREATE TABLE simulation_state_rates (
 jurisdiction text NOT NULL, rate_act text NOT NULL,
 numerator numeric(18,0) NOT NULL CHECK(numerator>0),
 denominator numeric(18,0) NOT NULL CHECK(denominator>0 AND numerator<=denominator),
 PRIMARY KEY(jurisdiction,rate_act)
);
CREATE TABLE simulation_state_authorities (
 authority_id uuid PRIMARY KEY REFERENCES case_records(id), version integer NOT NULL CHECK(version>1),
 verification jsonb NOT NULL, financial_terms jsonb NOT NULL,
 effective_from date NOT NULL, valid_through date NOT NULL, rules_published date NOT NULL,
 receipt_id uuid NOT NULL REFERENCES receipts(id), CHECK(valid_through>=effective_from)
);
CREATE TABLE simulation_state_publications (
 offer_id uuid PRIMARY KEY REFERENCES case_records(id), version integer NOT NULL CHECK(version>1),
 authority_id uuid NOT NULL REFERENCES simulation_state_authorities(authority_id),
 authority_version integer NOT NULL, publication jsonb NOT NULL,
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 receipt_id uuid NOT NULL REFERENCES receipts(id)
);
CREATE FUNCTION simulation_state_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Synthetic state bindings and published snapshots are immutable'; END $$;
CREATE TRIGGER immutable_state_origin BEFORE UPDATE OR DELETE ON simulation_state_origins FOR EACH ROW EXECUTE FUNCTION simulation_state_immutable();
CREATE TRIGGER immutable_state_rate BEFORE UPDATE OR DELETE ON simulation_state_rates FOR EACH ROW EXECUTE FUNCTION simulation_state_immutable();
CREATE TRIGGER immutable_state_authority BEFORE UPDATE OR DELETE ON simulation_state_authorities FOR EACH ROW EXECUTE FUNCTION simulation_state_immutable();
CREATE TRIGGER immutable_state_publication BEFORE UPDATE OR DELETE ON simulation_state_publications FOR EACH ROW EXECUTE FUNCTION simulation_state_immutable();
ALTER TABLE simulation_state_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_state_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_state_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_state_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON simulation_state_origins,simulation_state_rates,simulation_state_authorities,simulation_state_publications FROM PUBLIC,cornerstone_runtime;

CREATE FUNCTION simulation_open_state_packet(record_in uuid,receipt_in uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO simulation_state_origins(record_id,actor_id,institution_id,jurisdiction,receipt_id)
 SELECT c.id,a.id,a.institution_id,a.jurisdiction,r.id FROM case_records c
 JOIN actors a ON a.id=context_subject() JOIN receipts r ON r.id=receipt_in
 WHERE context_realm()='simulation' AND valid_actor_context() AND c.realm='simulation'
  AND c.id=record_in AND c.kind IN ('state_authority','offer') AND c.state='draft' AND c.version=1
  AND a.realm=c.realm AND a.id=c.owner_id AND a.assurance='privileged' AND 'state'=ANY(a.roles)
  AND a.institution_id IS NOT NULL AND a.institution_id=c.institution_id AND a.jurisdiction=c.jurisdiction
  AND NOT c.id=ANY(a.conflicts) AND r.record_id=c.id AND r.version=1 AND r.action='create'
  AND r.actor_id=a.id AND r.realm=c.realm;
 IF NOT FOUND THEN RAISE EXCEPTION 'STATE_PACKET_SCOPE'; END IF;
END $$;
CREATE FUNCTION simulation_state_owner(record_in uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT context_realm()='simulation' AND valid_actor_context() AND EXISTS(
  SELECT 1 FROM case_records c JOIN simulation_state_origins o ON o.record_id=c.id
  JOIN actors a ON a.id=context_subject() WHERE c.id=record_in AND c.realm='simulation'
   AND c.kind IN ('state_authority','offer') AND a.realm=c.realm AND a.id=c.owner_id AND a.id=o.actor_id
   AND a.assurance='privileged' AND 'state'=ANY(a.roles) AND a.institution_id=o.institution_id
   AND a.jurisdiction=o.jurisdiction AND c.jurisdiction=o.jurisdiction AND NOT c.id=ANY(a.conflicts)
 )
$$;
CREATE FUNCTION simulation_state_reviewer(record_in uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT context_realm()='simulation' AND valid_actor_context() AND EXISTS(
  SELECT 1 FROM case_records c JOIN simulation_state_origins o ON o.record_id=c.id
  JOIN actors a ON a.id=context_subject() WHERE c.id=record_in AND c.realm='simulation'
   AND c.kind IN ('state_authority','offer') AND a.realm=c.realm AND a.assurance='privileged'
   AND 'supervisor'=ANY(a.roles) AND NOT a.roles && ARRAY['state','participant','representative','member','provider','investor']::text[]
   AND a.id<>c.owner_id AND a.id<>o.actor_id AND a.institution_id<>o.institution_id
   AND a.institution_id=c.institution_id AND a.jurisdiction=o.jurisdiction AND c.jurisdiction=o.jurisdiction
   AND c.id=ANY(a.assignments) AND NOT c.id=ANY(a.conflicts)
 )
$$;
CREATE FUNCTION simulation_route_state_packet(record_in uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE institution uuid; affected integer;
BEGIN
 IF NOT simulation_state_owner(record_in) THEN RAISE EXCEPTION 'STATE_PACKET_SCOPE'; END IF;
 SELECT r.institution_id INTO institution FROM simulation_routing r JOIN case_records c ON c.kind=r.kind
 JOIN simulation_state_origins o ON o.record_id=c.id WHERE c.id=record_in AND c.state='draft'
  AND 'supervisor'=ANY(r.roles) AND r.institution_id<>o.institution_id;
 IF institution IS NULL THEN RAISE EXCEPTION 'STATE_REVIEW_ROUTE_UNAVAILABLE'; END IF;
 UPDATE actors a SET assignments=CASE WHEN record_in=ANY(a.assignments) THEN a.assignments ELSE array_append(a.assignments,record_in) END
 FROM simulation_state_origins o WHERE o.record_id=record_in AND a.realm='simulation'
  AND a.institution_id=institution AND a.assurance='privileged' AND 'supervisor'=ANY(a.roles)
  AND NOT a.roles && ARRAY['state','participant','representative','member','provider','investor']::text[]
  AND a.id<>o.actor_id AND a.jurisdiction=o.jurisdiction AND NOT record_in=ANY(a.conflicts);
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected=0 THEN RAISE EXCEPTION 'STATE_REVIEW_ROUTE_UNAVAILABLE'; END IF;
 RETURN institution;
END $$;
CREATE FUNCTION simulation_verify_state_authority(record_in uuid,receipt_in uuid,verification_in jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET TimeZone='UTC' AS $$
DECLARE c case_records%ROWTYPE; o simulation_state_origins%ROWTYPE; baseline simulation_state_rates%ROWTYPE;
 fraction jsonb; numerator_in numeric; denominator_in numeric;
BEGIN
 SELECT * INTO c FROM case_records WHERE id=record_in FOR UPDATE;
 SELECT * INTO o FROM simulation_state_origins WHERE record_id=record_in;
 IF NOT simulation_state_reviewer(record_in) OR c.kind<>'state_authority' OR c.state<>'verified'
  OR NOT EXISTS(SELECT 1 FROM receipts r WHERE r.id=receipt_in AND r.realm='simulation' AND r.record_id=c.id
   AND r.version=c.version AND r.actor_id=context_subject() AND r.action='verify') THEN
  RAISE EXCEPTION 'STATE_PACKET_SCOPE';
 END IF;
 IF jsonb_typeof(verification_in) IS DISTINCT FROM 'object' OR verification_in->'schemaVersion' IS DISTINCT FROM '1'::jsonb
  OR NOT verification_in ?& ARRAY['authorityId','authorityVersion','origin','verifierId','verifierInstitutionId','verifiedAt',
   'packetDigest','enactmentReference','appointmentReference','fiscalReportReference','supervisionResources','effectiveFrom','validThrough','rulesPublishedDate','financialTerms']
  OR verification_in->>'authorityId' IS DISTINCT FROM c.id::text OR (verification_in->>'authorityVersion')::integer IS DISTINCT FROM c.version
  OR verification_in->'origin' IS DISTINCT FROM jsonb_build_object('actorId',o.actor_id,'institutionId',o.institution_id,'jurisdiction',o.jurisdiction)
  OR verification_in->>'verifierId' IS DISTINCT FROM context_subject()::text
  OR verification_in->>'verifierInstitutionId' IS DISTINCT FROM c.institution_id::text
  OR (verification_in->>'verifiedAt')::timestamptz IS DISTINCT FROM c.updated_at
  OR (verification_in->>'effectiveFrom') IS NULL OR (verification_in->>'validThrough') IS NULL
  OR (verification_in->>'rulesPublishedDate') IS NULL
  OR (verification_in->>'effectiveFrom')::date>c.updated_at::date
  OR (verification_in->>'validThrough')::date<c.updated_at::date
  OR (verification_in->>'rulesPublishedDate')::date>c.updated_at::date THEN
  RAISE EXCEPTION 'STATE_PUBLICATION_BINDING';
 END IF;
 fraction:=verification_in->'financialTerms'->'rate';
 numerator_in:=(fraction->>'numerator')::numeric; denominator_in:=(fraction->>'denominator')::numeric;
 IF numerator_in IS NULL OR denominator_in IS NULL OR nullif(verification_in->'financialTerms'->>'rateActId','') IS NULL
  OR numerator_in<=0 OR numerator_in>denominator_in
  OR denominator_in>999999999999999999 OR numerator_in<>trunc(numerator_in) OR denominator_in<>trunc(denominator_in) THEN
  RAISE EXCEPTION 'STATE_PUBLICATION_BINDING';
 END IF;
 -- Unique insertion serializes concurrent packets reusing a jurisdiction/Rate Act identity.
 INSERT INTO simulation_state_rates(jurisdiction,rate_act,numerator,denominator)
 VALUES(o.jurisdiction,verification_in->'financialTerms'->>'rateActId',numerator_in,denominator_in)
 ON CONFLICT(jurisdiction,rate_act) DO NOTHING;
 SELECT * INTO baseline FROM simulation_state_rates WHERE jurisdiction=o.jurisdiction
  AND rate_act=verification_in->'financialTerms'->>'rateActId' FOR SHARE;
 IF baseline.numerator*denominator_in<>numerator_in*baseline.denominator THEN
  RAISE EXCEPTION 'STATE_RATE_ACT_CONFLICT';
 END IF;
 INSERT INTO simulation_state_authorities(authority_id,version,verification,financial_terms,effective_from,valid_through,rules_published,receipt_id)
 VALUES(c.id,c.version,verification_in,verification_in->'financialTerms',(verification_in->>'effectiveFrom')::date,
  (verification_in->>'validThrough')::date,(verification_in->>'rulesPublishedDate')::date,receipt_in);
END $$;
CREATE FUNCTION simulation_offer_authority(record_in uuid,authority_in uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF NOT (simulation_state_owner(record_in) OR simulation_state_reviewer(record_in)) THEN
  RAISE EXCEPTION 'STATE_PACKET_SCOPE';
 END IF;
 SELECT jsonb_build_object('state',c.state,'version',c.version,'verification',v.verification) INTO result
 FROM simulation_state_authorities v JOIN case_records c ON c.id=v.authority_id
 JOIN simulation_state_origins authority_origin ON authority_origin.record_id=c.id
 JOIN simulation_state_origins offer_origin ON offer_origin.record_id=record_in
 WHERE c.id=authority_in AND c.realm='simulation' AND c.kind='state_authority'
  AND authority_origin.institution_id=offer_origin.institution_id AND authority_origin.jurisdiction=offer_origin.jurisdiction
 FOR SHARE OF c;
 RETURN result;
END $$;
CREATE FUNCTION simulation_publish_state_offer(record_in uuid,receipt_in uuid,publication_in jsonb,digest_in text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET TimeZone='UTC' AS $$
DECLARE c case_records%ROWTYPE; a simulation_state_authorities%ROWTYPE; authority_public jsonb; earliest timestamptz;
BEGIN
 SELECT * INTO c FROM case_records WHERE id=record_in FOR UPDATE;
 IF NOT simulation_state_reviewer(record_in) OR c.kind<>'offer' OR c.state<>'published'
  OR NOT EXISTS(SELECT 1 FROM receipts r WHERE r.id=receipt_in AND r.realm='simulation' AND r.record_id=c.id
   AND r.version=c.version AND r.actor_id=context_subject() AND r.action='publish') THEN
  RAISE EXCEPTION 'STATE_PACKET_SCOPE';
 END IF;
 SELECT v.* INTO a FROM simulation_state_authorities v JOIN case_records ac ON ac.id=v.authority_id
 JOIN simulation_state_origins ao ON ao.record_id=ac.id JOIN simulation_state_origins po ON po.record_id=c.id
 WHERE v.authority_id=(publication_in->'authority'->>'id')::uuid AND ac.realm='simulation' AND ac.kind='state_authority'
  AND ac.state='verified' AND ac.version=v.version AND v.version=(publication_in->'authority'->>'version')::integer
  AND v.effective_from<=c.updated_at::date AND v.valid_through>=c.updated_at::date
  AND ao.institution_id=po.institution_id AND ao.jurisdiction=po.jurisdiction FOR SHARE OF ac;
 IF NOT FOUND THEN RAISE EXCEPTION 'STATE_PUBLICATION_BINDING'; END IF;
 authority_public:=jsonb_build_object('id',a.authority_id,'version',a.version,'packetDigest',a.verification->'packetDigest',
  'enactmentReference',a.verification->'enactmentReference','appointmentReference',a.verification->'appointmentReference',
  'fiscalReportReference',a.verification->'fiscalReportReference','supervisionResources',a.verification->'supervisionResources',
  'effectiveFrom',a.effective_from,'validThrough',a.valid_through,'rulesPublishedDate',a.rules_published);
 earliest:=greatest(c.updated_at,a.rules_published::timestamp AT TIME ZONE 'UTC')+interval '90 days';
 IF jsonb_typeof(publication_in) IS DISTINCT FROM 'object' OR publication_in->'schemaVersion' IS DISTINCT FROM '1'::jsonb
  OR NOT publication_in ?& ARRAY['schemaVersion','synthetic','offerId','version','title','jurisdiction','policyVersion','trade','district',
   'readinessSummary','serviceObligations','launchRequirements','regulatoryTerms','publicProtections','federalAuthority',
   'publicFindings','financialTerms','commercialMenu','initialYears','renewalYears','renewalLimit','authority',
   'publishedAt','earliestRankingsClose','earliestRankingsCloseAt']
  OR publication_in->'authority' IS DISTINCT FROM authority_public OR publication_in->'financialTerms' IS DISTINCT FROM a.financial_terms
  OR publication_in->>'offerId' IS DISTINCT FROM c.id::text OR (publication_in->>'version')::integer IS DISTINCT FROM c.version
  OR publication_in->>'jurisdiction' IS DISTINCT FROM c.jurisdiction OR publication_in->'synthetic' IS DISTINCT FROM 'true'::jsonb
  OR publication_in->>'policyVersion' IS DISTINCT FROM c.policy_version
  OR (publication_in->>'publishedAt')::timestamptz IS DISTINCT FROM c.updated_at
  OR (publication_in->>'earliestRankingsCloseAt')::timestamptz IS DISTINCT FROM earliest
  OR (publication_in->>'earliestRankingsClose')::date IS DISTINCT FROM (earliest AT TIME ZONE 'UTC')::date
  OR publication_in - ARRAY['schemaVersion','synthetic','offerId','version','title','jurisdiction','policyVersion','trade','district',
   'readinessSummary','serviceObligations','launchRequirements','regulatoryTerms','publicProtections','federalAuthority',
   'publicFindings','financialTerms','commercialMenu','initialYears','renewalYears','renewalLimit','authority',
   'publishedAt','earliestRankingsClose','earliestRankingsCloseAt']::text[]<>'{}'::jsonb THEN
  RAISE EXCEPTION 'STATE_PUBLICATION_BINDING';
 END IF;
 INSERT INTO simulation_state_publications(offer_id,version,authority_id,authority_version,publication,digest,receipt_id)
 VALUES(c.id,c.version,a.authority_id,a.version,publication_in,digest_in,receipt_in);
END $$;

-- Catalogue access discloses only the immutable allowlisted projection, never a private record or grant.
CREATE FUNCTION simulation_state_offer_catalogue(offer_in uuid,after_in uuid,limit_in integer) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp SET TimeZone='UTC' AS $$
 SELECT jsonb_build_object('publication',p.publication,'digest',p.digest,
  'status',CASE WHEN c.state='withdrawn' THEN 'withdrawn'
   WHEN c.state<>'published' OR c.version<>p.version OR ac.state<>'verified' OR ac.version<>p.authority_version
    OR a.effective_from>current_date OR a.valid_through<current_date THEN 'authority_unavailable' ELSE 'published' END,
  'withdrawnAt',CASE WHEN c.state='withdrawn' THEN c.updated_at ELSE NULL END)
 FROM simulation_state_publications p JOIN case_records c ON c.id=p.offer_id
 JOIN simulation_state_authorities a ON a.authority_id=p.authority_id JOIN case_records ac ON ac.id=a.authority_id
 WHERE context_realm()='simulation' AND valid_actor_context() AND c.realm='simulation' AND ac.realm='simulation'
  AND (offer_in IS NULL OR p.offer_id=offer_in) AND (after_in IS NULL OR p.offer_id>after_in)
 ORDER BY p.offer_id LIMIT least(greatest(limit_in,1),51)
$$;
-- New compact choices lock the published revision and its still-current authority through acceptance.
CREATE FUNCTION simulation_state_offer_choice(offer_in uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET TimeZone='UTC' AS $$
DECLARE result jsonb;
BEGIN
 IF context_realm()<>'simulation' OR NOT valid_actor_context() THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('publication',p.publication,'digest',p.digest,'status','published','withdrawnAt',NULL)
 INTO result FROM simulation_state_publications p JOIN case_records c ON c.id=p.offer_id
 JOIN simulation_state_authorities a ON a.authority_id=p.authority_id JOIN case_records ac ON ac.id=a.authority_id
 WHERE p.offer_id=offer_in AND c.realm='simulation' AND c.kind='offer' AND c.state='published' AND c.version=p.version
  AND ac.realm='simulation' AND ac.kind='state_authority' AND ac.state='verified' AND ac.version=p.authority_version
  AND a.effective_from<=current_date AND a.valid_through>=current_date FOR SHARE OF c,ac;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION simulation_state_immutable(),simulation_open_state_packet(uuid,uuid),simulation_state_owner(uuid),
 simulation_state_reviewer(uuid),simulation_route_state_packet(uuid),simulation_verify_state_authority(uuid,uuid,jsonb),
 simulation_offer_authority(uuid,uuid),simulation_publish_state_offer(uuid,uuid,jsonb,text),
 simulation_state_offer_catalogue(uuid,uuid,integer),simulation_state_offer_choice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation_open_state_packet(uuid,uuid),simulation_state_owner(uuid),simulation_state_reviewer(uuid),
 simulation_route_state_packet(uuid),simulation_verify_state_authority(uuid,uuid,jsonb),simulation_offer_authority(uuid,uuid),
 simulation_publish_state_offer(uuid,uuid,jsonb,text),simulation_state_offer_catalogue(uuid,uuid,integer),simulation_state_offer_choice(uuid) TO cornerstone_runtime;
