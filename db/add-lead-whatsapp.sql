-- Gives leads their own WhatsApp column (previously folded into notes).
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table public.leads add column if not exists whatsapp text;
