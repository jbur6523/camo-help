create extension if not exists pgcrypto;

create unique index if not exists promoters_email_normalized_uidx
  on public.promoters (lower(trim(email)));

create table if not exists public.promoter_accounts (
  id uuid primary key default gen_random_uuid(),
  promoter_id uuid not null references public.promoters(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  link_status text not null default 'confirmed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promoter_accounts_promoter_id_key unique (promoter_id),
  constraint promoter_accounts_auth_user_id_key unique (auth_user_id),
  constraint promoter_accounts_link_status_check
    check (link_status in ('confirmed', 'pending_admin_confirmation'))
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_promoter_accounts_updated_at on public.promoter_accounts;
create trigger set_promoter_accounts_updated_at
before update on public.promoter_accounts
for each row
execute function public.set_updated_at();

alter table public.promoter_accounts enable row level security;

drop policy if exists "Promoters can read their own account mapping" on public.promoter_accounts;
create policy "Promoters can read their own account mapping"
on public.promoter_accounts
for select
to authenticated
using (auth.uid() = auth_user_id);

drop policy if exists "Promoters can read their own registration" on public.promoters;
create policy "Promoters can read their own registration"
on public.promoters
for select
to authenticated
using (
  exists (
    select 1
    from public.promoter_accounts
    where promoter_accounts.promoter_id = promoters.id
      and promoter_accounts.auth_user_id = auth.uid()
  )
);

create or replace function public.register_promoter_account(
  p_auth_user_id uuid,
  p_email text,
  p_promotion_name text,
  p_last_promotion_date text,
  p_contact_name text,
  p_government_id_filename text,
  p_website_or_social text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  normalized_email text := lower(trim(p_email));
  auth_email text;
  selected_promoter public.promoters%rowtype;
  selected_account public.promoter_accounts%rowtype;
begin
  select lower(trim(email))
  into auth_email
  from auth.users
  where id = p_auth_user_id;

  if auth_email is null or auth_email <> normalized_email then
    raise exception using errcode = 'P0001', message = 'AUTH_EMAIL_MISMATCH';
  end if;

  select *
  into selected_account
  from public.promoter_accounts
  where auth_user_id = p_auth_user_id
  for update;

  if found then
    select *
    into selected_promoter
    from public.promoters
    where id = selected_account.promoter_id;

    if lower(trim(selected_promoter.email)) <> normalized_email then
      raise exception using errcode = 'P0001', message = 'ACCOUNT_MAPPING_CONFLICT';
    end if;

    return jsonb_build_object(
      'outcome', 'already_linked',
      'promoterStatus', selected_promoter.status,
      'linkStatus', selected_account.link_status
    );
  end if;

  select *
  into selected_promoter
  from public.promoters
  where lower(trim(email)) = normalized_email
  for update;

  if not found then
    insert into public.promoters (
      promotion_name,
      license_number,
      email,
      contact_name,
      phone,
      website_or_social,
      status
    )
    values (
      trim(p_promotion_name),
      trim(p_last_promotion_date),
      normalized_email,
      trim(p_contact_name),
      p_government_id_filename,
      nullif(trim(p_website_or_social), ''),
      'pending'
    )
    returning * into selected_promoter;

    insert into public.promoter_accounts (promoter_id, auth_user_id, link_status)
    values (selected_promoter.id, p_auth_user_id, 'confirmed');

    return jsonb_build_object(
      'outcome', 'created_pending',
      'promoterStatus', selected_promoter.status,
      'linkStatus', 'confirmed'
    );
  end if;

  if exists (
    select 1
    from public.promoter_accounts
    where promoter_id = selected_promoter.id
  ) then
    raise exception using errcode = 'P0001', message = 'PROMOTER_ALREADY_LINKED';
  end if;

  insert into public.promoter_accounts (promoter_id, auth_user_id, link_status)
  values (selected_promoter.id, p_auth_user_id, 'pending_admin_confirmation');

  return jsonb_build_object(
    'outcome', 'existing_confirmation_required',
    'promoterStatus', selected_promoter.status,
    'linkStatus', 'pending_admin_confirmation'
  );
end;
$$;

revoke all on function public.register_promoter_account(uuid, text, text, text, text, text, text) from public;
revoke all on function public.register_promoter_account(uuid, text, text, text, text, text, text) from anon;
revoke all on function public.register_promoter_account(uuid, text, text, text, text, text, text) from authenticated;
grant execute on function public.register_promoter_account(uuid, text, text, text, text, text, text) to service_role;
