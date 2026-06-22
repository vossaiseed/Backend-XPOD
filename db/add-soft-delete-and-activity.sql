-- Soft-delete (Trash) support across users + an activity log.
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table public.partners      add column if not exists deleted_at timestamptz;
alter table public.sales_team     add column if not exists deleted_at timestamptz;
alter table public.lead_managers  add column if not exists deleted_at timestamptz;

create table if not exists public.activity_log (
    id          uuid primary key default gen_random_uuid(),
    action      text not null,            -- created | deleted | restored | purged
    entity_type text not null,            -- lead | partner | sales | lead_manager
    entity_id   uuid,
    entity_name text,
    actor_name  text,
    created_at  timestamptz not null default now()
);

create index if not exists activity_log_created_idx on public.activity_log (created_at desc);
