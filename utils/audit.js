/**
 * Resolve the actor name to record for an action. When an admin is impersonating
 * another user, the action runs as that user but is tagged with the driving admin
 * so the activity log stays honest: "MI (via Admin Priya)".
 */
export const actorName = (req) => {
    const base = req.profile?.name || req.role || "admin";
    return req.impersonatedBy?.name
        ? `${base} (via Admin ${req.impersonatedBy.name})`
        : base;
};

const ROLE_LABEL = {
    admin: "Admin",
    salesman: "Sales Staff",
    leadmanager: "Lead Manager",
    partner: "Partner",
};

/** Actor name with a role label for notifications: "test sales (Sales Staff)". */
export const actorWithRole = (req) => {
    const base = req.profile?.name || req.role || "Someone";
    const label = ROLE_LABEL[req.role];
    const withRole = label ? `${base} (${label})` : base;
    return req.impersonatedBy?.name
        ? `${withRole} (via Admin ${req.impersonatedBy.name})`
        : withRole;
};
