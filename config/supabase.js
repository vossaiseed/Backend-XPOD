import "./env.js";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey) {
    throw new Error(
        "Missing Supabase environment variables (SUPABASE_URL / SUPABASE_ANON_KEY)"
    );
}

/**
 * Public (anon) client.
 * Used for password sign-in and verifying user access tokens.
 */
export const supabase = createClient(supabaseUrl, anonKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

/**
 * Admin (service-role) client. REQUIRED for:
 *   - supabase.auth.admin.createUser / deleteUser
 *   - reads/writes that must bypass Row Level Security
 *
 * Falls back to the anon client if no service-role key is configured, so the
 * server still boots — but admin-only operations (creating partners / sales /
 * lead managers) will fail until SUPABASE_SERVICE_ROLE_KEY is set in .env.
 */
export const supabaseAdmin = serviceKey
    ? createClient(supabaseUrl, serviceKey, {
          auth: {
              autoRefreshToken: false,
              persistSession: false,
          },
      })
    : supabase;

export const hasServiceRole = Boolean(serviceKey);

if (!hasServiceRole) {
    console.warn(
        "⚠️  SUPABASE_SERVICE_ROLE_KEY not set — admin operations (create user / bypass RLS) will not work."
    );
}
