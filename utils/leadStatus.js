/**
 * Lead lifecycle vocabulary.
 *
 * The live DB has no `stage` column — a lead's position in the pipeline is
 * derived from:
 *   - status        (the working sub-state)
 *   - deleted_at    (non-null  → in trash)
 *   - assigned_to   (non-null  → assigned to a sales person)
 *   - partner_id    (null      → "general" lead, not linked to a partner)
 */
export const LEAD_STATUS = {
    PENDING: "pending", // submitted, awaiting review/assignment
    NEW: "new",
    IN_PROGRESS: "in_progress",
    DISCUSSION: "discussion",
    FOLLOWUP: "followup",
    CONVERSION_REQUESTED: "conversion_requested",
    CONVERTED: "converted",
    NOT_INTERESTED: "not_interested",
    FAILED: "failed",
};

export const ALL_STATUSES = Object.values(LEAD_STATUS);
