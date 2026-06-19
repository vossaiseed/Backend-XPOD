/**
 * One-time cleanup: older leads stored the WhatsApp number inside `notes` as a
 * "WhatsApp: <number>" line. This moves it into the dedicated `whatsapp` column
 * and strips that line from `notes`.
 *
 * Run AFTER db/add-lead-whatsapp.sql, from xpodBackend/:
 *   node scripts/migrate-whatsapp-from-notes.js
 *
 * Idempotent — safe to re-run (already-migrated leads have no WhatsApp line).
 */
import { supabaseAdmin, hasServiceRole } from "../config/supabase.js";

const WA_LINE = /^\s*WhatsApp:\s*(.+)\s*$/i;

const run = async () => {
    if (!hasServiceRole) {
        console.error("❌ SUPABASE_SERVICE_ROLE_KEY is not set. Aborting.");
        process.exit(1);
    }

    // Confirm the column exists (migration run?).
    const probe = await supabaseAdmin.from("leads").select("whatsapp").limit(1);
    if (probe.error) {
        console.error(
            "❌ `whatsapp` column not found. Run db/add-lead-whatsapp.sql first."
        );
        process.exit(1);
    }

    const { data: leads, error } = await supabaseAdmin
        .from("leads")
        .select("id, notes, whatsapp")
        .ilike("notes", "%WhatsApp:%");

    if (error) {
        console.error("Failed to read leads:", error.message);
        process.exit(1);
    }

    let updated = 0;
    for (const lead of leads || []) {
        const lines = String(lead.notes || "").split("\n");
        const waLine = lines.find((l) => WA_LINE.test(l));
        if (!waLine) continue;

        const number = waLine.match(WA_LINE)[1].trim();
        const newNotes = lines.filter((l) => !WA_LINE.test(l)).join("\n").trim();

        const { error: upErr } = await supabaseAdmin
            .from("leads")
            .update({
                // Don't clobber an existing whatsapp value.
                whatsapp: lead.whatsapp || number,
                notes: newNotes || null,
            })
            .eq("id", lead.id);

        if (upErr) {
            console.error(`  ❌ ${lead.id}: ${upErr.message}`);
        } else {
            updated++;
            console.log(`  ✅ ${lead.id}: whatsapp="${number}"`);
        }
    }

    console.log(`\nDone. Migrated ${updated} lead(s).`);
    process.exit(0);
};

run();
