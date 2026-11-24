/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { signInAnonymously, onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./firebase.ts";

export const COUPLE_SESSION_KEY = "oaks_couple_session_v1";

export interface CoupleSessionMeta {
  submissionId: string;
  resumeToken: string;
  createdAt: string;
}

export interface AnonymousAuthResult {
  uid: string;
  isAnonymous: boolean;
}

let inFlightAnonSignIn: Promise<AnonymousAuthResult | null> | null = null;

/**
 * Generates a cryptographically strong, URL-safe token with at least 128 bits of entropy
 * (24 random bytes = 192 bits -> 32 base64url chars).
 */
export function generateResumeToken(): string {
  const bytes = new Uint8Array(24);
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Fallback for non-browser test environments if crypto.getRandomValues is absent
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Generates one stable submission ID that stays fixed across every draft save,
 * photo upload, and submission retry (preventing duplicate records & burned numbers).
 */
export function generateStableSubmissionId(): string {
  const bytes = new Uint8Array(6);
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const suffix = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sub_${Date.now()}_${suffix}`;
}

export function isValidResumeToken(token: string | null | undefined): token is string {
  return Boolean(
    token &&
      typeof token === "string" &&
      token.length >= 22 &&
      /^[A-Za-z0-9_-]+$/.test(token)
  );
}

export function loadStoredCoupleSession(): CoupleSessionMeta | null {
  try {
    const raw = localStorage.getItem(COUPLE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CoupleSessionMeta>;
    if (
      parsed &&
      typeof parsed.submissionId === "string" &&
      parsed.submissionId.length >= 8 &&
      isValidResumeToken(parsed.resumeToken)
    ) {
      return {
        submissionId: parsed.submissionId,
        resumeToken: parsed.resumeToken,
        createdAt:
          typeof parsed.createdAt === "string"
            ? parsed.createdAt
            : new Date().toISOString(),
      };
    }
  } catch {
    // localStorage blocked (e.g. private / strict WebView)
  }
  return null;
}

export function saveStoredCoupleSession(session: CoupleSessionMeta): void {
  try {
    localStorage.setItem(COUPLE_SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore storage quota / privacy restrictions
  }
}

export function clearStoredCoupleSession(): void {
  try {
    localStorage.removeItem(COUPLE_SESSION_KEY);
  } catch {
    // ignore
  }
}

let inMemorySession: CoupleSessionMeta | null = null;

export function getActiveCoupleSession(): CoupleSessionMeta | null {
  if (inMemorySession) return inMemorySession;
  const stored = loadStoredCoupleSession();
  if (stored) {
    inMemorySession = stored;
    return stored;
  }
  return null;
}

export function setActiveCoupleSession(session: CoupleSessionMeta): CoupleSessionMeta {
  inMemorySession = session;
  saveStoredCoupleSession(session);
  return session;
}

export function getOrCreateCoupleSession(): CoupleSessionMeta {
  const existing = getActiveCoupleSession();
  if (existing) return existing;
  const created: CoupleSessionMeta = {
    submissionId: generateStableSubmissionId(),
    resumeToken: generateResumeToken(),
    createdAt: new Date().toISOString(),
  };
  return setActiveCoupleSession(created);
}

export function resetActiveCoupleSession(): void {
  inMemorySession = null;
  clearStoredCoupleSession();
}

/**
 * Detects whether an origin is a private AI Studio preview or localhost URL
 * (which other users/clients cannot open without the owner's Google account).
 */
export function isPrivatePreviewOrigin(originOverride?: string): boolean {
  const origin =
    originOverride ??
    (typeof window !== "undefined" ? window.location.origin : "");
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      /^ais-(dev|pre)-[a-z0-9.-]+\.run\.app$/.test(host)
    );
  } catch {
    return false;
  }
}

function getConfiguredPublicAppOrigin(): string {
  try {
    const raw = (import.meta as unknown as { env?: Record<string, string | undefined> })
      ?.env?.VITE_PUBLIC_APP_URL;
    if (typeof raw === "string" && /^https?:\/\//i.test(raw.trim())) {
      return raw.trim().replace(/\/+$/, "");
    }
  } catch {
    // ignore in non-Vite test runtimes
  }
  return "";
}

export function buildResumeUrl(resumeToken: string, originOverride?: string): string {
  const rawOrigin =
    originOverride ||
    getConfiguredPublicAppOrigin() ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const cleanOrigin = rawOrigin.replace(/\/+$/, "");
  return `${cleanOrigin}/?resume=${encodeURIComponent(resumeToken)}`;
}

/**
 * Pure helper fixing the Step-0 overwrite bug:
 * When reopening the site, currentStep starts at 0 while saved progress is > 0.
 * Never overwrite saved progress with 0 unless the user explicitly resets.
 */
export function computePersistedStep(
  currentStep: number,
  existingSavedStep: number
): number {
  if (currentStep > 0) return currentStep;
  return existingSavedStep > 0 ? existingSavedStep : 0;
}

/**
 * Redacts any resume token from strings before logging or saving to submissionErrors.
 */
export function redactResumeTokens(input: string, knownToken?: string | null): string {
  if (!input) return "";
  let sanitized = input.replace(/([?&]resume=)[^&\s#]+/gi, "$1[REDACTED]");
  if (knownToken && knownToken.length >= 16) {
    sanitized = sanitized.split(knownToken).join("[REDACTED]");
  }
  return sanitized;
}

/**
 * Detects device, browser, and in-app WebView (WhatsApp, Instagram, Facebook, Line, etc.)
 * for diagnostics without capturing any personal user data.
 */
export function detectDeviceAndBrowser(userAgentOverride?: string): string {
  const ua =
    userAgentOverride ??
    (typeof navigator !== "undefined" ? navigator.userAgent || "" : "unknown");

  let os = "Unknown OS";
  if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Browser";
  if (/WhatsApp/i.test(ua)) browser = "WhatsApp In-App Browser";
  else if (/Instagram/i.test(ua)) browser = "Instagram In-App Browser";
  else if (/FBAN|FBAV|FB_IAB/i.test(ua)) browser = "Facebook In-App Browser";
  else if (/Line\//i.test(ua)) browser = "LINE In-App Browser";
  else if (/wv\)|; wv\)/i.test(ua)) browser = "Android WebView";
  else if (/CriOS|Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = "Chrome";
  else if (/Edg/i.test(ua)) browser = "Edge";
  else if (/FxiOS|Firefox/i.test(ua)) browser = "Firefox";
  else if (/Safari/i.test(ua)) browser = "Safari";

  return `${os} · ${browser}`;
}

export function isInAppBrowser(userAgentOverride?: string): boolean {
  const ua =
    userAgentOverride ??
    (typeof navigator !== "undefined" ? navigator.userAgent || "" : "");
  return /WhatsApp|Instagram|FBAN|FBAV|FB_IAB|Line\/|; wv\)/i.test(ua);
}

/**
 * Waits briefly for Firebase Auth to restore any existing persisted user (admin or anonymous)
 * before deciding whether to create a fresh anonymous session.
 */
function waitForInitialAuthUser(timeoutMs = 2500): Promise<User | null> {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        unsub();
        resolve(auth.currentUser);
      }
    }, timeoutMs);

    const unsub = onAuthStateChanged(auth, (user) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        unsub();
        resolve(user);
      }
    });
  });
}

/**
 * Silently signs the couple in using Firebase Anonymous Authentication on first load.
 * Never signs out or overrides an already signed-in studio admin.
 */
export async function ensureCoupleAnonymousAuth(): Promise<AnonymousAuthResult | null> {
  if (auth.currentUser) {
    return {
      uid: auth.currentUser.uid,
      isAnonymous: auth.currentUser.isAnonymous,
    };
  }

  if (inFlightAnonSignIn) {
    return inFlightAnonSignIn;
  }

  inFlightAnonSignIn = (async () => {
    try {
      const existing = await waitForInitialAuthUser();
      if (existing) {
        return {
          uid: existing.uid,
          isAnonymous: existing.isAnonymous,
        };
      }

      const credential = await signInAnonymously(auth);
      return {
        uid: credential.user.uid,
        isAnonymous: credential.user.isAnonymous,
      };
    } catch (err: any) {
      // Do not crash the questionnaire if Anonymous Auth isn't toggled on yet in Firebase Console
      console.warn(
        "Anonymous sign-in unavailable (enable Anonymous provider in Firebase Authentication):",
        err?.code || err?.message || "unknown"
      );
      return null;
    } finally {
      inFlightAnonSignIn = null;
    }
  })();

  return inFlightAnonSignIn;
}
