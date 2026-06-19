import { supabaseAdmin, hasServiceRole } from "../config/supabase.js";
import { ApiError, fromSupabase } from "../utils/ApiError.js";

const BUCKET = "uploads";
let bucketReady = false;

/** Create the public storage bucket on first use (idempotent). */
const ensureBucket = async () => {
    if (bucketReady) return;
    if (!hasServiceRole) {
        throw new ApiError(
            500,
            "Server is not configured with SUPABASE_SERVICE_ROLE_KEY — cannot upload files."
        );
    }
    const { data } = await supabaseAdmin.storage.getBucket(BUCKET);
    if (!data) {
        const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
            public: true,
            fileSizeLimit: "5MB",
        });
        // Ignore "already exists" races; surface anything else.
        if (error && !/exist/i.test(error.message)) throw fromSupabase(error);
    }
    bucketReady = true;
};

/**
 * Decode a base64 data URL, upload it to Supabase Storage, and return the
 * public URL. `folder` groups files (e.g. "partners").
 */
export const uploadDataUrl = async (dataUrl, folder = "misc") => {
    const match = /^data:(.+?);base64,(.*)$/s.exec(dataUrl || "");
    if (!match) throw ApiError.badRequest("Invalid image data");

    const contentType = match[1];
    if (!/^(image|audio)\//.test(contentType)) {
        throw ApiError.badRequest("Only image or audio uploads are allowed");
    }

    const buffer = Buffer.from(match[2], "base64");
    const ext = (contentType.split("/")[1] || "jpg").split("+")[0];
    const safeFolder = folder.replace(/[^a-z0-9-_]/gi, "") || "misc";
    const fileName = `${safeFolder}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

    await ensureBucket();

    const { error } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(fileName, buffer, { contentType, upsert: false });
    if (error) throw fromSupabase(error);

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(fileName);
    return data.publicUrl;
};
