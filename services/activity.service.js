import { supabaseAdmin } from "../config/supabase.js";

/**
 * Record an activity entry. Best-effort — if the activity_log table doesn't
 * exist yet (migration not run) it's silently ignored, never breaking the
 * action that triggered it.
 */
export const logActivity = async ({
    action,
    entityType,
    entityId,
    entityName,
    actorName,
}) => {
    await supabaseAdmin
        .from("activity_log")
        .insert({
            action,
            entity_type: entityType,
            entity_id: entityId,
            entity_name: entityName || null,
            actor_name: actorName || null,
        })
        .then(() => {})
        .catch(() => {});
};

export const listActivity = async (limit = 100) => {
    const { data, error } = await supabaseAdmin
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) return [];
    return data || [];
};
