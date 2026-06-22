-- App settings (single row) + lead sources. Run once in the Supabase SQL editor.

create table if not exists public.app_settings (
    id                   int primary key default 1,
    lead_assignment_mode text default 'pool',   -- 'pool' | 'auto'
    call_number          text,
    whatsapp_number      text,
    whatsapp_message     text,
    updated_at           timestamptz not null default now(),
    constraint app_settings_single_row check (id = 1)
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.lead_sources (
    id         uuid primary key default gen_random_uuid(),
    name       text not null,
    active     boolean default true,
    created_at timestamptz not null default now()
);
