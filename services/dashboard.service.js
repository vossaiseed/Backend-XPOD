import { supabaseAdmin } from "../config/supabase.js";
import { LEAD_STATUS } from "../utils/leadStatus.js";

/**
 * Resilient count: returns 0 if the query errors (e.g. a column that doesn't
 * exist in this DB) instead of throwing — so one bad sub-query never 400s the
 * whole dashboard.
 */
const safeCount = async (table, build = (q) => q) => {
    try {
        const { count, error } = await build(
            supabaseAdmin.from(table).select("*", { count: "exact", head: true })
        );
        return error ? 0 : count || 0;
    } catch {
        return 0;
    }
};

const safeSelect = async (table, columns, build = (q) => q) => {
    try {
        const { data, error } = await build(
            supabaseAdmin.from(table).select(columns)
        );
        return error ? [] : data || [];
    } catch {
        return [];
    }
};

const notTrashed = (q) => q.is("deleted_at", null);

/** Admin dashboard summary. */
export const getAdminDashboard = async () => {
    const [
        totalLeads,
        converted,
        pendingReview,
        conversionRequests,
        vipLeads,
        partners,
        salesStaff,
        leadManagers,
    ] = await Promise.all([
        safeCount("leads", notTrashed),
        safeCount("leads", (q) => notTrashed(q).eq("status", LEAD_STATUS.CONVERTED)),
        safeCount("leads", (q) => notTrashed(q).eq("status", LEAD_STATUS.PENDING)),
        safeCount("leads", (q) =>
            notTrashed(q).eq("status", LEAD_STATUS.CONVERSION_REQUESTED)
        ),
        safeCount("leads", (q) => notTrashed(q).eq("is_vip", true)),
        safeCount("partners"),
        safeCount("sales_team"),
        safeCount("lead_managers"),
    ]);

    const partnerRows = await safeSelect(
        "partners",
        "id, name, royalty_percent, status"
    );

    const convertedLeads = await safeSelect("leads", "value", (q) =>
        notTrashed(q).eq("status", LEAD_STATUS.CONVERTED)
    );
    const totalRevenue = convertedLeads.reduce(
        (sum, l) => sum + Number(l.value || 0),
        0
    );

    const hotLeads = await safeSelect(
        "leads",
        "id, name, value, location, is_vip",
        (q) =>
            notTrashed(q)
                .order("value", { ascending: false, nullsFirst: false })
                .limit(5)
    );

    const pendingReviewList = await safeSelect(
        "leads",
        "id, name, source, created_at",
        (q) =>
            notTrashed(q)
                .eq("status", LEAD_STATUS.PENDING)
                .order("created_at", { ascending: false })
                .limit(10)
    );

    const conversionList = await safeSelect(
        "leads",
        "id, name, assigned_to, status",
        (q) =>
            notTrashed(q)
                .eq("status", LEAD_STATUS.CONVERSION_REQUESTED)
                .limit(10)
    );

    return {
        stats: {
            totalLeads,
            converted,
            pendingReview,
            conversionRequests,
            vipLeads,
            totalRevenue,
            totalRoyalty: 0,
            partners,
            salesStaff,
            leadManagers,
        },
        hotLeads,
        pendingReview: pendingReviewList,
        conversionRequests: conversionList,
        partners: partnerRows,
    };
};

/** Lead-manager dashboard, optionally scoped to one manager's leads. */
export const getLeadManagerDashboard = async (leadManagerId) => {
    const scope = (q) =>
        leadManagerId ? q.eq("lead_manager_id", leadManagerId) : q;

    const [totalLeads, converted, assigned, conversionRequests, vipLeads] =
        await Promise.all([
            safeCount("leads", (q) => scope(notTrashed(q))),
            safeCount("leads", (q) =>
                scope(notTrashed(q)).eq("status", LEAD_STATUS.CONVERTED)
            ),
            safeCount("leads", (q) =>
                scope(notTrashed(q)).not("assigned_to", "is", null)
            ),
            safeCount("leads", (q) =>
                scope(notTrashed(q)).eq("status", LEAD_STATUS.CONVERSION_REQUESTED)
            ),
            safeCount("leads", (q) =>
                scope(notTrashed(q)).eq("is_vip", true)
            ),
        ]);

    const salesStaff = await safeSelect(
        "sales_team",
        "id, name, capacity, max_lead_capacity, active"
    );

    return {
        stats: {
            totalLeads,
            converted,
            assigned,
            conversionRequests,
            vipLeads,
        },
        salesCapacity: salesStaff,
        salesStaff,
    };
};

/** Partner dashboard, scoped to one partner's leads. */
export const getPartnerDashboard = async (partnerId) => {
    const scope = (q) => q.eq("partner_id", partnerId);

    const [totalLeads, converted, pending] = await Promise.all([
        safeCount("leads", (q) => scope(notTrashed(q))),
        safeCount("leads", (q) =>
            scope(notTrashed(q)).eq("status", LEAD_STATUS.CONVERTED)
        ),
        safeCount("leads", (q) =>
            scope(notTrashed(q)).eq("status", LEAD_STATUS.PENDING)
        ),
    ]);

    return { stats: { totalLeads, converted, pendingReview: pending } };
};
