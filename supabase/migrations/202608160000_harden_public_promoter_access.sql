drop policy if exists "Promoter registrations can be created as pending" on public.promoters;

revoke insert, update, delete, truncate, references, trigger
  on public.promoters, public.promoter_accounts
  from anon, authenticated;

grant select on public.promoters to anon, authenticated;
grant select on public.promoter_accounts to authenticated;
