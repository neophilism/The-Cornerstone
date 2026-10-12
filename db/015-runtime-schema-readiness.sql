-- Read-only compatibility metadata; it grants no access to private tables or migration writes.
CREATE FUNCTION public.runtime_schema_inventory()
RETURNS TABLE(name text, sha256 text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT m.name, m.sha256 FROM public.schema_migrations m ORDER BY m.name
$$;
REVOKE ALL ON FUNCTION public.runtime_schema_inventory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.runtime_schema_inventory() TO cornerstone_runtime, cornerstone_worker;
