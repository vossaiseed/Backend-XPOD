-- Per-deal royalty % captured when a lead is converted (Approve Conversion).
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table public.leads add column if not exists royalty_percent numeric;
