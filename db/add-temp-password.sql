-- Adds the temp_password column to sales_team and lead_managers so the admin
-- cards can reveal the login password (eye icon), same as partners.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.
-- temp_password is a dev convenience; remove it for a production deployment.

alter table public.sales_team    add column if not exists temp_password text;
alter table public.lead_managers add column if not exists temp_password text;
