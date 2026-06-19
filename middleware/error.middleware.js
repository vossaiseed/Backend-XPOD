import { ApiError } from "../utils/ApiError.js";

/** 404 handler for unmatched routes. */
export const notFound = (req, res, next) => {
    next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

/** Central error renderer. Must be the LAST middleware mounted. */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
    const status = err.statusCode || 500;

    if (status >= 500) {
        console.error("Unhandled error:", err);
    }

    res.status(status).json({
        message: err.message || "Internal server error",
        ...(err.details ? { details: err.details } : {}),
    });
};
