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

    const salesCapacity = await safeSelect(
        "sales_team",
        "id, name, capacity, max_lead_capacity"
    );

    // Royalty earned = sum over converted leads of value × royalty%
    // (per-deal royalty if set, else the partner's default).
    const partnerById = Object.fromEntries(partnerRows.map((p) => [p.id, p]));
    const convertedForRoyalty = await safeSelect("leads", "*", (q) =>
        notTrashed(q).eq("status", LEAD_STATUS.CONVERTED)
    );
    const totalRoyalty = convertedForRoyalty.reduce((sum, l) => {
        const pct = l.royalty_percent ?? partnerById[l.partner_id]?.royalty_percent ?? 0;
        return sum + (Number(l.value || 0) * Number(pct)) / 100;
    }, 0);

    return {
        stats: {
            totalLeads,
            converted,
            pendingReview,
            conversionRequests,
            vipLeads,
            totalRevenue,
            totalRoyalty,
            partners,
            salesStaff,
            leadManagers,
        },
        hotLeads,
        pendingReview: pendingReviewList,
        conversionRequests: conversionList,
        partners: partnerRows,
        salesCapacity,
    };
};

/** Lead-manager dashboard, optionally scoped to one manager's leads. */
export const getLeadManagerDashboard = async () => {
    // The lead manager oversees the whole lead flow, so the dashboard reflects
    // all live (non-trashed) leads — not just ones they created.
    const leads = await safeSelect(
        "leads",
        "id, name, status, assigned_to, is_vip, value, created_at, updated_at",
        notTrashed
    );
    const staff = await safeSelect("sales_team", "id, name, capacity, max_lead_capacity");
    const staffById = Object.fromEntries(staff.map((s) => [s.id, s]));

    const ACTIVE = [
        LEAD_STATUS.NEW,
        LEAD_STATUS.IN_PROGRESS,
        LEAD_STATUS.DISCUSSION,
        LEAD_STATUS.FOLLOWUP,
        LEAD_STATUS.CONVERSION_REQUESTED,
    ];
    const now = Date.now();
    const hoursSince = (d) => (d ? (now - new Date(d).getTime()) / 3600000 : Infinity);
    const isToday = (d) => {
        if (!d) return false;
        const x = new Date(d);
        const t = new Date();
        return (
            x.getFullYear() === t.getFullYear() &&
            x.getMonth() === t.getMonth() &&
            x.getDate() === t.getDate()
        );
    };
    const byStatus = (st) => leads.filter((l) => l.status === st).length;

    const pipeline = {
        pending: byStatus(LEAD_STATUS.PENDING),
        new: byStatus(LEAD_STATUS.NEW),
        discussion: byStatus(LEAD_STATUS.DISCUSSION),
        followup: byStatus(LEAD_STATUS.FOLLOWUP),
        converted: byStatus(LEAD_STATUS.CONVERTED),
        failed: byStatus(LEAD_STATUS.FAILED),
    };

    // Inactive = assigned + still active + no update within 48h.
    const inactiveRows = leads.filter(
        (l) =>
            l.assigned_to &&
            ACTIVE.includes(l.status) &&
            hoursSince(l.updated_at || l.created_at) >= 48
    );
    const inactiveLeads = inactiveRows.slice(0, 30).map((l) => ({
        id: l.id,
        name: l.name,
        sales_staff_name: staffById[l.assigned_to]?.name || "Unassigned",
    }));

    // Per-staff load + performance.
    const salesStaff = staff.map((s) => {
        const mine = leads.filter((l) => l.assigned_to === s.id);
        const converted = mine.filter((l) => l.status === LEAD_STATUS.CONVERTED).length;
        const failed = mine.filter((l) => l.status === LEAD_STATUS.FAILED).length;
        const assigned = mine.length;
        const active = Math.max(0, assigned - converted - failed);
        const capacity = Number(s.max_lead_capacity || s.capacity || 10);
        return { id: s.id, name: s.name, assigned, converted, capacity, score: converted * 10 + active };
    });

    // Recent activity from the lead reports timeline (best-effort).
    const reports = await safeSelect(
        "lead_reports",
        "id, lead_id, status, author_name, created_at",
        (q) => q.order("created_at", { ascending: false }).limit(10)
    );
    const nameById = Object.fromEntries(leads.map((l) => [l.id, l.name]));
    const recentActivity = reports.map((r) => ({
        id: r.id,
        user: r.author_name || "—",
        lead: nameById[r.lead_id] || "a lead",
        time: new Date(r.created_at).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
        }),
    }));

    return {
        stats: {
            totalLeads: leads.length,
            pendingReview: pipeline.pending,
            vipLeads: leads.filter((l) => l.is_vip).length,
            assignedToday: leads.filter((l) => l.assigned_to && isToday(l.updated_at || l.created_at)).length,
            inactive: inactiveRows.length,
            converted: pipeline.converted,
            activeStaff: staff.length,
            conversionRequests: byStatus(LEAD_STATUS.CONVERSION_REQUESTED),
        },
        pipeline,
        salesStaff,
        salesCapacity: salesStaff,
        inactiveLeads,
        recentActivity,
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
