-- Lead reports / activity timeline. Run once in the Supabase SQL editor.

create table if not exists public.lead_reports (
    id            uuid primary key default gen_random_uuid(),
    lead_id       uuid not null references public.leads (id) on delete cascade,
    note          text,
    status        text,          -- status the lead was set to with this report
    next_followup date,
    author_name   text,
    created_at    timestamptz not null default now()
);

create index if not exists lead_reports_lead_idx on public.lead_reports (lead_id, created_at desc);
