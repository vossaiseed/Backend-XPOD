-- ─────────────────────────────────────────────────────────────────────────
--  XPOD CRM — run ALL pending migrations at once.
--  Paste this whole file into the Supabase SQL editor and Run.
--  Idempotent & safe to re-run. Then RESTART the backend (npm run dev).
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Login password reveal (sales / lead managers)
alter table public.sales_team    add column if not exists temp_password text;
alter table public.lead_managers  add column if not exists temp_password text;

-- Per-salesman commission rate (%) used for earnings/conversion commission.
alter table public.sales_team    add column if not exists commission_rate numeric default 1;

-- 2) Leads: separate WhatsApp, creator, per-deal royalty, requirement
alter table public.leads add column if not exists whatsapp        text;
alter table public.leads add column if not exists created_by      text;
alter table public.leads add column if not exists royalty_percent numeric;
alter table public.leads add column if not exists requirement     text;

-- 3) Soft delete (Trash) + archive for users/partners
alter table public.partners      add column if not exists deleted_at  timestamptz;
alter table public.partners      add column if not exists archived_at timestamptz;
alter table public.sales_team     add column if not exists deleted_at  timestamptz;
alter table public.sales_team     add column if not exists archived_at timestamptz;
alter table public.lead_managers  add column if not exists deleted_at  timestamptz;
alter table public.lead_managers  add column if not exists archived_at timestamptz;

-- 4) Activity log (Trash → Activity Log tab)
create table if not exists public.activity_log (
    id          uuid primary key default gen_random_uuid(),
    action      text not null,
    entity_type text not null,
    entity_id   uuid,
    entity_name text,
    actor_name  text,
    created_at  timestamptz not null default now()
);
create index if not exists activity_log_created_idx on public.activity_log (created_at desc);

-- 5) App settings (single row) + lead sources
create table if not exists public.app_settings (
    id                   int primary key default 1,
    lead_assignment_mode text default 'pool',
    call_number          text,
    whatsapp_number      text,
    whatsapp_message     text,
    updated_at           timestamptz not null default now(),
    constraint app_settings_single_row check (id = 1)
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- Advanced settings
alter table public.app_settings add column if not exists auto_whatsapp_welcome        boolean default false;
alter table public.app_settings add column if not exists require_lead_manager_review  boolean default true;
alter table public.app_settings add column if not exists inactivity_alert_enabled     boolean default true;
alter table public.app_settings add column if not exists inactivity_alert_hours       int     default 48;
alter table public.app_settings add column if not exists max_active_leads_per_staff   int     default 100;
alter table public.app_settings add column if not exists lead_reassignment_permission text    default 'lead_manager';
alter table public.app_settings add column if not exists lead_delete_protection       boolean default true;

create table if not exists public.lead_sources (
    id         uuid primary key default gen_random_uuid(),
    name       text not null,
    active     boolean default true,
    created_at timestamptz not null default now()
);

-- 6) Lead reports / activity timeline
create table if not exists public.lead_reports (
    id            uuid primary key default gen_random_uuid(),
    lead_id       uuid not null references public.leads (id) on delete cascade,
    note          text,
    status        text,
    next_followup date,
    author_name   text,
    created_at    timestamptz not null default now()
);
create index if not exists lead_reports_lead_idx on public.lead_reports (lead_id, created_at desc);
