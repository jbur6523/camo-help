create extension if not exists pgcrypto;

create table if not exists public.promoters (
  id uuid primary key default gen_random_uuid(),
  promotion_name text not null,
  license_number text not null,
  email text not null,
  contact_name text not null,
  phone text not null,
  website_or_social text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promoters_status_check check (status in ('pending', 'active', 'denied', 'disabled')),
  constraint promoters_promotion_name_not_blank check (length(trim(promotion_name)) > 0),
  constraint promoters_license_number_not_blank check (length(trim(license_number)) > 0),
  constraint promoters_email_not_blank check (length(trim(email)) > 0),
  constraint promoters_contact_name_not_blank check (length(trim(contact_name)) > 0),
  constraint promoters_phone_not_blank check (length(trim(phone)) > 0)
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'promoters'
      and column_name = 'promoter_license_number'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'promoters'
      and column_name = 'license_number'
  ) then
    alter table public.promoters rename column promoter_license_number to license_number;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'promoters'
      and column_name = 'promoter_email'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'promoters'
      and column_name = 'email'
  ) then
    alter table public.promoters rename column promoter_email to email;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'promoters'
      and column_name = 'website_url'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'promoters'
      and column_name = 'website_or_social'
  ) then
    alter table public.promoters rename column website_url to website_or_social;
  end if;
end;
$$;

alter table public.promoters
  add column if not exists license_number text,
  add column if not exists email text,
  add column if not exists contact_name text,
  add column if not exists phone text,
  add column if not exists website_or_social text,
  add column if not exists status text not null default 'pending',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.promoters
  alter column status set default 'pending',
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.promoters drop constraint if exists promoters_status_check;
alter table public.promoters drop constraint if exists promoters_promotion_name_not_blank;
alter table public.promoters drop constraint if exists promoters_license_number_not_blank;
alter table public.promoters drop constraint if exists promoters_email_not_blank;
alter table public.promoters drop constraint if exists promoters_contact_name_not_blank;
alter table public.promoters drop constraint if exists promoters_phone_not_blank;

alter table public.promoters
  add constraint promoters_status_check check (status in ('pending', 'active', 'denied', 'disabled')),
  add constraint promoters_promotion_name_not_blank check (length(trim(promotion_name)) > 0),
  add constraint promoters_license_number_not_blank check (length(trim(license_number)) > 0),
  add constraint promoters_email_not_blank check (length(trim(email)) > 0),
  add constraint promoters_contact_name_not_blank check (length(trim(contact_name)) > 0),
  add constraint promoters_phone_not_blank check (length(trim(phone)) > 0);

alter table public.promoters
  alter column promotion_name set not null,
  alter column license_number set not null,
  alter column email set not null,
  alter column contact_name set not null,
  alter column phone set not null,
  alter column status set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

create index if not exists promoters_status_promotion_name_idx
  on public.promoters (status, promotion_name);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_promoters_updated_at on public.promoters;

create trigger set_promoters_updated_at
before update on public.promoters
for each row
execute function public.set_updated_at();

alter table public.promoters enable row level security;

drop policy if exists "Active promoters are publicly readable" on public.promoters;
create policy "Active promoters are publicly readable"
on public.promoters
for select
to anon, authenticated
using (status = 'active');

drop policy if exists "Promoter registrations can be created as pending" on public.promoters;
create policy "Promoter registrations can be created as pending"
on public.promoters
for insert
to anon, authenticated
with check (status = 'pending');
