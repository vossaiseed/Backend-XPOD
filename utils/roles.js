export const ROLES = {
    ADMIN: "admin",
    LEAD_MANAGER: "lead_manager",
    SALES_STAFF: "sales_staff",
    PARTNER: "partner",
};

export const homeForRole = (role) => {
    switch (role) {
        case "admin":
            return "/AdminCRM";

        case "lead_manager":
            return "/LeadManagerDashboard";

        case "sales_staff":
            return "/SalesmanDashboard";

        case "partner":
            return "/PartnerDashboard";

        default:
            return "/login";
    }
};