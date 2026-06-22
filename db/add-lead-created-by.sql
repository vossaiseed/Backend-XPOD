-- Records who added each lead (shown as the "By" name on lead cards).
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table public.leads add column if not exists created_by text;
