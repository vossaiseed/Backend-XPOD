/**
 * Operational error carrying an HTTP status code. Thrown from services /
 * controllers and rendered by the error middleware.
 */
export class ApiError extends Error {
    constructor(statusCode, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.isOperational = true;
        Error.captureStackTrace?.(this, this.constructor);
    }

    static badRequest(msg = "Bad request", details) {
        return new ApiError(400, msg, details);
    }
    static unauthorized(msg = "Unauthorized") {
        return new ApiError(401, msg);
    }
    static forbidden(msg = "Access denied") {
        return new ApiError(403, msg);
    }
    static notFound(msg = "Not found") {
        return new ApiError(404, msg);
    }
}

/**
 * Turn a Supabase { error } into an ApiError. Supabase errors are not thrown,
 * they're returned — call this right after a query when error is truthy.
 */
export const fromSupabase = (error, fallbackStatus = 400) => {
    const status = error?.code === "PGRST116" ? 404 : fallbackStatus;
    return new ApiError(status, error?.message || "Database error", {
        code: error?.code,
        hint: error?.hint,
    });
};
