import type { RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { GenerateBriefBody } from "@workspace/api-zod";

const projectId = "oaks-couple-questionnaire";
const keys = createRemoteJWKSet(new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
));
// Preserve the original studio's built-in policy, including Firestore-added admins.
const builtInAdmins = new Set([
  "rahulratna88@gmail.com",
  "mywedding@oakswedding.com",
  "oaksoperations@gmail.com",
]);

export async function verifyFirebaseToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, keys, {
    algorithms: ["RS256"],
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    requiredClaims: ["sub", "exp", "iat", "auth_time"],
    maxTokenAge: "1h",
  });
  if (!payload.sub || payload.sub.length > 128) throw new Error("Invalid identity");
  return payload;
}

async function isStudioAdmin(identity: JWTPayload, token: string): Promise<boolean> {
  const provider = (identity.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider;
  if (provider === "anonymous" || typeof identity.email !== "string") return false;
  const email = identity.email.trim().toLowerCase();
  if (identity.email_verified === true && builtInAdmins.has(email)) return true;
  // Use the caller's token, not an admin service credential. Firestore rules remain
  // authoritative, and a missing/inactive admin record always fails closed.
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/admins/${encodeURIComponent(email)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) return false;
  const data = await response.json() as { fields?: { active?: { booleanValue?: boolean } } };
  return data.fields?.active?.booleanValue !== false;
}

type GuardOptions = {
  verify?: typeof verifyFirebaseToken;
  authorize?: typeof isStudioAdmin;
  now?: () => number;
};

export function createAiProtection(options: GuardOptions = {}): RequestHandler {
  const verify = options.verify ?? verifyFirebaseToken;
  const authorize = options.authorize ?? isStudioAdmin;
  const now = options.now ?? Date.now;
  const quotas = new Map<string, { window: number; count: number; day: number; daily: number }>();
  let active = 0;
  let totalDay = 0;
  let total = 0;
  return async (req, res, next) => {
    if (!/^\/api\/generate-(brief|interview|cheatsheet|letter)\/?$/i.test(req.path)) {
      next();
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) {
      res.status(401).json({ error: "Studio sign-in required" });
      return;
    }
    let identity: JWTPayload;
    try {
      identity = await verify(token);
    } catch {
      res.status(401).json({ error: "Invalid or expired Firebase identity" });
      return;
    }
    try {
      if (!(await authorize(identity, token))) {
        res.status(403).json({ error: "Studio admin access required" });
        return;
      }
    } catch {
      res.status(503).json({ error: "Unable to verify studio access" });
      return;
    }
    const input = GenerateBriefBody.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ error: "Invalid generation input" });
      return;
    }
    req.body = input.data;
    const time = now();
    const window = Math.floor(time / 600_000);
    const day = Math.floor(time / 86_400_000);
    if (totalDay !== day) { totalDay = day; total = 0; }
    // Remove old entries so quota bookkeeping cannot grow without bound.
    for (const [uid, quota] of quotas) if (quota.day !== day) quotas.delete(uid);
    const uid = identity.sub!;
    const quota = quotas.get(uid) ?? { window, count: 0, day, daily: 0 };
    if (quota.window !== window) { quota.window = window; quota.count = 0; }
    if (quota.day !== day) { quota.day = day; quota.daily = 0; }
    if (quota.count >= 8 || quota.daily >= 40 || total >= 500 || active >= 2) {
      res.setHeader("Retry-After", "600");
      res.status(429).json({ error: "Generation limit reached; please try again later" });
      return;
    }
    quota.count++;
    quota.daily++;
    total++;
    quotas.set(uid, quota);
    active++;
    let released = false;
    const release = () => { if (!released) { released = true; active--; } };
    res.once("finish", release);
    res.once("close", release);
    next();
  };
}
