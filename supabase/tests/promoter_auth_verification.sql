select jsonb_build_object(
  'tables', (
    select jsonb_agg(tablename order by tablename)
    from pg_tables
    where schemaname = 'public'
      and tablename in ('promoters', 'promoter_accounts')
  ),
  'rls', (
    select jsonb_object_agg(relname, relrowsecurity)
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in ('promoters', 'promoter_accounts')
  ),
  'policies', (
    select jsonb_agg(policyname order by policyname)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('promoters', 'promoter_accounts')
  ),
  'account_constraints', (
    select jsonb_agg(conname order by conname)
    from pg_constraint
    where conrelid = 'public.promoter_accounts'::regclass
  ),
  'normalized_email_index', to_regclass('public.promoters_email_normalized_uidx') is not null,
  'anon_rpc_execute', has_function_privilege(
    'anon',
    'public.register_promoter_account(uuid,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated_rpc_execute', has_function_privilege(
    'authenticated',
    'public.register_promoter_account(uuid,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'service_role_rpc_execute', has_function_privilege(
    'service_role',
    'public.register_promoter_account(uuid,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'promoter_rows', (select count(*) from public.promoters),
  'account_rows', (select count(*) from public.promoter_accounts)
) as verification;
