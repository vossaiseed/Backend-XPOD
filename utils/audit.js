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
