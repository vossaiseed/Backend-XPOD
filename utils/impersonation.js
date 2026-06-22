import crypto from "crypto";

/**
 * Short-lived admin-impersonation tokens.
 *
 * These are our OWN signed JWTs (HS256), separate from Supabase's tokens. The
 * auth middleware tries to verify an incoming token as one of these first; if it
 * validates, the request runs AS the target user (sub) while recording which
 * admin is driving it (by / byName). No password or stored secret of the target
 * is ever needed.
 *
 * Secret: set IMPERSONATION_SECRET in prod. Falls back to the service-role key
 * (a strong, server-only secret) so it works out of the box in dev.
 */
const SECRET =
    process.env.IMPERSONATION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "xpod-dev-impersonation-secret-change-me";

const ISSUER = "xpod-admin-impersonation";
const DEFAULT_TTL_SECONDS = 15 * 60; // 15 min sliding window (extended on activity)
export const MAX_SESSION_SECONDS = 2 * 60 * 60; // absolute cap from first View

const b64url = (input) => Buffer.from(input).toString("base64url");
const sign = (data) =>
    crypto.createHmac("sha256", SECRET).update(data).digest("base64url");

/**
 * Mint an impersonation token. `payload` should include sub, role, by, byName.
 * `start` (original View time) is preserved across refreshes so the absolute
 * session cap is enforced regardless of how many times it's extended.
 */
export const signImpersonation = (payload, ttlSeconds = DEFAULT_TTL_SECONDS) => {
    const header = { alg: "HS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const body = {
        ...payload,
        start: payload.start || now,
        imp: true,
        iss: ISSUER,
        iat: now,
        exp: now + ttlSeconds,
    };
    const h = b64url(JSON.stringify(header));
    const p = b64url(JSON.stringify(body));
    const s = sign(`${h}.${p}`);
    return `${h}.${p}.${s}`;
};

/**
 * Verify a token AS an impersonation token. Returns the payload if it is a
 * valid, unexpired impersonation token; returns null otherwise (e.g. a normal
 * Supabase token), so the caller can fall through to Supabase verification.
 */
export const verifyImpersonation = (token) => {
    try {
        const parts = token.split(".");
        if (parts.length !== 3) return null;
        const [h, p, s] = parts;

        const expected = sign(`${h}.${p}`);
        const sBuf = Buffer.from(s);
        const eBuf = Buffer.from(expected);
        if (sBuf.length !== eBuf.length) return null;
        if (!crypto.timingSafeEqual(sBuf, eBuf)) return null;

        const payload = JSON.parse(Buffer.from(p, "base64url").toString());
        if (!payload.imp || payload.iss !== ISSUER) return null;
        if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;

        return payload;
    } catch {
        return null;
    }
};
