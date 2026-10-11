-- Additive synthetic fixtures. No deletion or alteration of existing user records.
DO $$
DECLARE first_actor uuid:=gen_random_uuid(); second_actor uuid:=gen_random_uuid(); case_id uuid:=gen_random_uuid(); conflicted_actor uuid:=gen_random_uuid(); conflicted_case uuid:=gen_random_uuid();
BEGIN
 INSERT INTO actors(id,realm,issuer,subject) VALUES(first_actor,'simulation','synthetic:rls-test',first_actor::text),(second_actor,'proposal','synthetic:rls-test',second_actor::text);
 INSERT INTO case_records(id,realm,kind,state,version,owner_id,policy_version,payload_cipher) VALUES(case_id,'simulation','dossier','draft',1,first_actor,'synthetic-test','{}');
 INSERT INTO actors(id,realm,issuer,subject,conflicts) VALUES(conflicted_actor,'simulation','synthetic:rls-test',conflicted_actor::text,ARRAY[case_id,conflicted_case]);
 INSERT INTO case_records(id,realm,kind,state,version,owner_id,policy_version,payload_cipher) VALUES(conflicted_case,'simulation','dossier','draft',1,conflicted_actor,'synthetic-test','{}');
 INSERT INTO grants(id,realm,record_id,owner_id,subject_id,permissions,expires_at) VALUES(gen_random_uuid(),'simulation',case_id,first_actor,conflicted_actor,ARRAY['read'],now()+interval '1 day');
 PERFORM set_config('cornerstone.test_conflicted_actor',conflicted_actor::text,true);PERFORM set_config('cornerstone.test_conflicted_case',conflicted_case::text,true);
 PERFORM set_config('cornerstone.test_actor',first_actor::text,true);PERFORM set_config('cornerstone.test_case',case_id::text,true);
END $$;
SET LOCAL ROLE cornerstone_runtime;
SELECT set_config('app.subject',current_setting('cornerstone.test_actor'),true),set_config('app.realm','simulation',true);
DO $$
DECLARE n integer; case_id uuid:=current_setting('cornerstone.test_case')::uuid;
BEGIN
 SELECT count(*) INTO n FROM case_records WHERE id=case_id;IF n<>1 THEN RAISE EXCEPTION 'Owner visibility failed';END IF;
 PERFORM set_config('app.realm','proposal',true);SELECT count(*) INTO n FROM case_records WHERE id=case_id;IF n<>0 THEN RAISE EXCEPTION 'Cross-realm record leak';END IF;
 PERFORM set_config('app.realm','simulation',true);PERFORM set_config('app.subject',gen_random_uuid()::text,true);SELECT count(*) INTO n FROM case_records WHERE id=case_id;IF n<>0 THEN RAISE EXCEPTION 'Unrelated actor record leak';END IF;
 PERFORM set_config('app.subject',current_setting('cornerstone.test_conflicted_actor'),true);SELECT count(*) INTO n FROM case_records WHERE id IN (case_id,current_setting('cornerstone.test_conflicted_case')::uuid);IF n<>0 THEN RAISE EXCEPTION 'Conflicted owner or delegation record leak';END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolbypassrls OR rolsuper OR rolcreatedb OR rolcreaterole)) THEN RAISE EXCEPTION 'Privileged runtime role';END IF;
 IF has_table_privilege(current_user,'actors','SELECT') OR has_table_privilege(current_user,'sessions','SELECT') THEN RAISE EXCEPTION 'Runtime identity-table access';END IF;
END $$;
RESET ROLE;
SELECT 'PASS: owner scope, cross-realm isolation, unrelated actor denial, restricted role and identity-table denial' AS result;
