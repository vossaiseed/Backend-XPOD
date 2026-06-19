import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { uploadDataUrl } from "../services/uploads.service.js";

// POST /api/uploads  { dataUrl, folder } -> { url }
export const uploadImage = asyncHandler(async (req, res) => {
    const { dataUrl, folder } = req.body;
    if (!dataUrl) throw ApiError.badRequest("dataUrl is required");
    const url = await uploadDataUrl(dataUrl, folder || "misc");
    res.status(201).json({ url });
});
