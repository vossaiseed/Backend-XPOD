-- ─────────────────────────────────────────────────────────────────────────
--  XPOD CRM — Supabase schema (documents the LIVE database)
--
--  These tables already exist in the project's Supabase instance. This file
--  mirrors their real columns so the schema is version-controlled and can be
--  recreated. `create table if not exists` will NOT alter existing tables.
--
--  Roles must match src/auth/roles.js and utils/roles.js:
--    admin | salesman | leadmanager | partner
--
--  There is NO `stage` column. A lead's pipeline position is derived from:
--    status        — working sub-state ('pending','new','in_progress',
--                    'discussion','followup','conversion_requested',
--                    'converted','not_interested','failed')
--    deleted_at    — non-null → in trash (soft delete)
--    assigned_to   — non-null → assigned to a sales person
--    partner_id    — null     → "general" lead (not linked to a partner)
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
    id          uuid primary key references auth.users (id) on delete cascade,
    name        text,
    email       text,
    phone       text unique,
    role        text not null default 'salesman'
                check (role in ('admin','salesman','leadmanager','partner')),
    status      text not null default 'active',
    created_at  timestamptz not null default now()
);

-- ── partners ────────────────────────────────────────────────────────────────
create table if not exists public.partners (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid references auth.users (id) on delete set null,
    profile_id      uuid references public.profiles (id) on delete set null,
    name            text not null,
    email           text,
    phone           text,
    company         text,
    location        text,
    state           text,
    partner_type    text default 'Authorized Partner',
    photo_url       text,
    royalty_percent numeric default 0,
    temp_password   text,            -- dev convenience only; drop in prod
    status          text not null default 'active',
    created_at      timestamptz not null default now()
);

-- ── sales_team ──────────────────────────────────────────────────────────────
create table if not exists public.sales_team (
    id                 uuid primary key default gen_random_uuid(),
    user_id            uuid references auth.users (id) on delete set null,
    login_email        text,
    name               text not null,
    email              text,
    phone              text,
    location           text,
    state              text,
    role               text default 'Official Sales Person',
    capacity           integer default 0,
    max_lead_capacity  integer default 10,
    closing_capacity   text default 'other',
    active             boolean default true,
    temp_password      text,            -- dev convenience only; drop in prod
    restricted_access  boolean default false,
    languages          jsonb default '[]'::jsonb,
    lead_sources       jsonb default '[]'::jsonb,
    partner_categories jsonb default '[]'::jsonb,
    specific_partners  jsonb default '[]'::jsonb,
    lead_permissions   jsonb default '{}'::jsonb,
    photo_url          text,
    created_at         timestamptz not null default now()
);

-- ── lead_managers ───────────────────────────────────────────────────────────
create table if not exists public.lead_managers (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid references auth.users (id) on delete set null,
    login_email text,
    name        text not null,
    email       text,
    phone       text,
    location    text,
    state       text,
    photo_url   text,
    temp_password text,                 -- dev convenience only; drop in prod
    created_at  timestamptz not null default now()
);

-- ── leads ───────────────────────────────────────────────────────────────────
create table if not exists public.leads (
    id              uuid primary key default gen_random_uuid(),
    name            text not null,
    phone           text,
    whatsapp        text,
    email           text,
    location        text,
    state           text,
    designation     text,
    source          text,
    language        text,
    units           text,
    model           text,
    urgency         text,
    notes           text,
    audio_url       text,
    value           numeric default 0,
    is_vip          boolean default false,
    status          text not null default 'pending',

    partner_id      uuid references public.partners (id) on delete set null,
    lead_manager_id uuid references public.lead_managers (id) on delete set null,
    assigned_to     uuid references public.sales_team (id) on delete set null,

    deleted_at      timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists leads_status_idx       on public.leads (status);
create index if not exists leads_assigned_to_idx  on public.leads (assigned_to);
create index if not exists leads_partner_id_idx   on public.leads (partner_id);
create index if not exists leads_deleted_at_idx   on public.leads (deleted_at);

-- ── auto-create a profile when a new auth user signs up ───────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profiles (id, name, email, phone, role)
    values (
        new.id,
        new.raw_user_meta_data->>'name',
        new.email,
        new.raw_user_meta_data->>'phone',
        coalesce(new.raw_user_meta_data->>'role', 'salesman')
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
