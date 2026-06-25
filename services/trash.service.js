import { supabaseAdmin } from "../config/supabase.js";
import { ApiError, fromSupabase } from "../utils/ApiError.js";
import { columnExists } from "../utils/db.js";
import { deleteAuthUser } from "./users.service.js";
import { logActivity } from "./activity.service.js";

// Each type declares HOW it marks trash:
//  - mode "status":     status='trashed' (partners — uses an existing column)
//  - mode "deleted_at": deleted_at IS NOT NULL (needs the soft-delete migration)
const TYPES = {
    lead: { table: "leads", label: "Lead", mode: "deleted_at" },
    partner: { table: "partners", label: "Partner", mode: "deleted_at" },
    sales: { table: "sales_team", label: "Sales Staff", mode: "deleted_at" },
    lead_manager: { table: "lead_managers", label: "Lead Manager", mode: "deleted_at" },
};

// Entities that support archiving (hidden from list, kept out of Trash).
// Leads have no archived_at column, so they're excluded.
const ARCHIVE_TYPES = {
    partner: { table: "partners", label: "Partner" },
    sales: { table: "sales_team", label: "Sales Staff" },
    lead_manager: { table: "lead_managers", label: "Lead Manager" },
};

const resolve = (type) => {
    const cfg = TYPES[type];
    if (!cfg) throw ApiError.badRequest(`Unknown trash type: ${type}`);
    return cfg;
};

const resolveArchive = (type) => {
    const cfg = ARCHIVE_TYPES[type];
    if (!cfg) throw ApiError.badRequest(`Type "${type}" cannot be archived`);
    return cfg;
};

/** Everything currently in the trash. */
export const listTrash = async () => {
    const items = [];
    for (const [type, { table, label, mode }] of Object.entries(TYPES)) {
        if (mode === "status") {
            const { data } = await supabaseAdmin
                .from(table)
                .select("id, name, created_at")
                .eq("status", "trashed")
                .order("created_at", { ascending: false });
            for (const r of data || [])
                items.push({ type, typeLabel: label, id: r.id, name: r.name, deleted_at: null });
        } else {
            if (!(await columnExists(table, "deleted_at"))) continue;
            const { data } = await supabaseAdmin
                .from(table)
                .select("id, name, deleted_at")
                .not("deleted_at", "is", null)
                .order("deleted_at", { ascending: false });
            for (const r of data || [])
                items.push({ type, typeLabel: label, id: r.id, name: r.name, deleted_at: r.deleted_at });
        }
    }
    items.sort((a, b) => new Date(b.deleted_at || 0) - new Date(a.deleted_at || 0));
    return items;
};

/**
 * Lightweight total of everything in the trash — head/count queries only, no
 * rows transferred. Matches listTrash().length exactly (same predicates).
 */
export const countTrash = async () => {
    let total = 0;
    for (const [, { table, mode }] of Object.entries(TYPES)) {
        if (mode === "status") {
            const { count } = await supabaseAdmin
                .from(table)
                .select("id", { count: "exact", head: true })
                .eq("status", "trashed");
            total += count || 0;
        } else {
            if (!(await columnExists(table, "deleted_at"))) continue;
            const { count } = await supabaseAdmin
                .from(table)
                .select("id", { count: "exact", head: true })
                .not("deleted_at", "is", null);
            total += count || 0;
        }
    }
    return total;
};

/** Everything currently archived (partners / sales / lead managers). */
export const listArchived = async () => {
    const items = [];
    for (const [type, { table, label }] of Object.entries(ARCHIVE_TYPES)) {
        if (!(await columnExists(table, "archived_at"))) continue;
        const { data } = await supabaseAdmin
            .from(table)
            .select("id, name, archived_at")
            .not("archived_at", "is", null)
            .order("archived_at", { ascending: false });
        for (const r of data || [])
            items.push({ type, typeLabel: label, id: r.id, name: r.name, archived_at: r.archived_at });
    }
    items.sort((a, b) => new Date(b.archived_at || 0) - new Date(a.archived_at || 0));
    return items;
};

/** Un-archive — return an archived item to the active list. */
export const unarchiveItem = async (type, id, actorName) => {
    const { table } = resolveArchive(type);
    const { data, error } = await supabaseAdmin
        .from(table)
        .update({ archived_at: null })
        .eq("id", id)
        .select()
        .single();
    if (error) throw fromSupabase(error);
    await logActivity({
        action: "unarchived",
        entityType: type,
        entityId: id,
        entityName: data?.name,
        actorName,
    });
    return data;
};

/** Restore a trashed item. */
export const restoreItem = async (type, id, actorName) => {
    const { table, mode } = resolve(type);
    const patch = mode === "status" ? { status: "active" } : { deleted_at: null };
    const { data, error } = await supabaseAdmin
        .from(table)
        .update(patch)
        .eq("id", id)
        .select()
        .single();
    if (error) throw fromSupabase(error);
    await logActivity({
        action: "restored",
        entityType: type,
        entityId: id,
        entityName: data?.name,
        actorName,
    });
    return data;
};

/** Permanently delete a trashed item (and its auth account for user types). */
export const purgeItem = async (type, id, actorName) => {
    const { table } = resolve(type);

    const { data: row } = await supabaseAdmin
        .from(table)
        .select("name, user_id")
        .eq("id", id)
        .maybeSingle();

    const { error } = await supabaseAdmin.from(table).delete().eq("id", id);
    if (error) throw fromSupabase(error);

    if (type !== "lead" && row?.user_id) await deleteAuthUser(row.user_id);

    await logActivity({
        action: "purged",
        entityType: type,
        entityId: id,
        entityName: row?.name,
        actorName,
    });
    return { id };
};
