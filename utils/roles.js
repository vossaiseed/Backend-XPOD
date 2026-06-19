/**
 * Canonical role set. MUST match:
 *   - the frontend src/auth/roles.js
 *   - the profiles.role check constraint in schema.sql
 */
export const ROLES = {
    ADMIN: "admin",
    SALESMAN: "salesman",
    LEAD_MANAGER: "leadmanager",
    PARTNER: "partner",
};

export const ALL_ROLES = Object.values(ROLES);

export const ROLE_HOME = {
    [ROLES.ADMIN]: "/AdminCRM",
    [ROLES.SALESMAN]: "/SalesmanDashboard",
    [ROLES.LEAD_MANAGER]: "/LeadManagerDashboard",
    [ROLES.PARTNER]: "/PartnerDashboard",
};

export const homeForRole = (role) => ROLE_HOME[role] ?? "/login";
