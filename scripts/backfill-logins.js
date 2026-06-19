/**
 * One-time backfill: give every partner / sales / lead-manager row a working
 * login (Supabase auth user + profiles row) if it doesn't already have one.
 *
 * Usage (from xpodBackend/):
 *   node scripts/backfill-logins.js               # default password Xpod@1234
 *   node scripts/backfill-logins.js MyPass123     # custom default password
 *
 * - Rows with NO user_id      -> a login is created with the default password
 *                                (partners reuse their stored temp_password if set).
 * - Rows WITH user_id but no   -> the profiles row is repaired (password unchanged).
 *   matching profiles row
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.
 */
import { supabaseAdmin, hasServiceRole } from "../config/supabase.js";
import { provisionUser, ensureProfile } from "../services/users.service.js";
import { ROLES } from "../utils/roles.js";

const DEFAULT_PASSWORD = process.argv[2] || "Xpod@1234";

const TABLES = [
    { table: "partners", role: ROLES.PARTNER },
    { table: "sales_team", role: ROLES.SALESMAN },
    { table: "lead_managers", role: ROLES.LEAD_MANAGER },
];

const run = async () => {
    if (!hasServiceRole) {
        console.error("SUPABASE_SERVICE_ROLE_KEY is not set. Aborting.");
        process.exit(1);
    }

    const created = [];

    for (const { table, role } of TABLES) {
        const { data: rows, error } = await supabaseAdmin.from(table).select("*");
        if (error) {
            console.error(`Skipping ${table}: ${error.message}`);
            continue;
        }

        for (const row of rows) {
            try {
                if (row.user_id) {
                    // Has an auth user — just make sure a profile exists.
                    await ensureProfile({
                        userId: row.user_id,
                        name: row.name,
                        email: row.login_email || row.email,
                        phone: row.phone,
                        role,
                    });
                    continue;
                }

                const password =
                    (table === "partners" && row.temp_password) ||
                    DEFAULT_PASSWORD;

                const { userId, loginEmail } = await provisionUser({
                    email: row.email,
                    phone: row.phone,
                    password,
                    name: row.name,
                    role,
                });

                await supabaseAdmin
                    .from(table)
                    .update({ user_id: userId, login_email: loginEmail })
                    .eq("id", row.id);

                created.push({ table, name: row.name, phone: row.phone, password });
                console.log(`✅ ${table}: ${row.name} (phone ${row.phone}) — login created`);
            } catch (e) {
                console.error(`❌ ${table}: ${row.name} (phone ${row.phone}) — ${e.message}`);
            }
        }
    }

    console.log("\n──────── Logins created ────────");
    if (created.length === 0) {
        console.log("(none — everyone already had a login)");
    } else {
        created.forEach((c) =>
            console.log(`  ${c.phone}  /  ${c.password}   [${c.table} • ${c.name}]`)
        );
    }
    console.log("\nDone. Users log in with their PHONE + the password shown above.");
    process.exit(0);
};

run();
