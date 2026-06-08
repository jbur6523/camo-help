create extension if not exists pgcrypto;

create table if not exists public.promoters (
  id uuid primary key default gen_random_uuid(),
  promotion_name text not null,
  promoter_license_number text not null,
  promoter_email text not null,
  contact_name text not null,
  phone text not null,
  website_url text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  constraint promoters_status_check check (status in ('pending', 'active', 'denied', 'disabled')),
  constraint promoters_promotion_name_not_blank check (length(trim(promotion_name)) > 0),
  constraint promoters_license_number_not_blank check (length(trim(promoter_license_number)) > 0),
  constraint promoters_email_not_blank check (length(trim(promoter_email)) > 0),
  constraint promoters_contact_name_not_blank check (length(trim(contact_name)) > 0),
  constraint promoters_phone_not_blank check (length(trim(phone)) > 0)
);

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
