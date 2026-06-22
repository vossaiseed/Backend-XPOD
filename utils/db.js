import { supabaseAdmin } from "../config/supabase.js";

// Cache whether a given table.column exists, so queries can degrade gracefully
// on DBs where an optional migration hasn't been run yet.
const cache = {};

export const columnExists = async (table, column) => {
    const key = `${table}.${column}`;
    if (cache[key] !== undefined) return cache[key];
    const { error } = await supabaseAdmin.from(table).select(column).limit(1);
    cache[key] = !error;
    return cache[key];
};
