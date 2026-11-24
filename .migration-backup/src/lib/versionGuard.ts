/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildResumeUrl, getActiveCoupleSession } from "./coupleSession.ts";
import { logSubmissionError } from "./errorLogger.ts";

declare const __APP_BUILD_ID__: string | undefined;

const RELOAD_GUARD_KEY = "oaks_version_reload_guard_v1";
const RELOAD_COOLDOWN_MS = 15_000;

export type BeforeReloadFlusher = () => Promise<void>;

let registeredFlusher: BeforeReloadFlusher | null = null;
let reloadInProgress = false;

export function registerBeforeReloadFlusher(flusher: BeforeReloadFlusher | null): void {
  registeredFlusher = flusher;
}

export function getCurrentBuildId(): string {
  try {
    return typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "dev";
  } catch {
    return "dev";
  }
}

export function isChunkLoadError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
      ? err
      : String((err as { message?: unknown })?.message || "");
  const lower = message.toLowerCase();
  return (
    lower.includes("failed to fetch dynamically imported module") ||
    lower.includes("importing a module script failed") ||
    lower.includes("error loading dynamically imported module") ||
    lower.includes("loading chunk") ||
    lower.includes("loading css chunk")
  );
}

function canSafeReloadNow(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || "0");
    if (last && Date.now() - last < RELOAD_COOLDOWN_MS) {
      return false;
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

/**
 * Safely saves the couple's draft (local + online, capped at 3.5s) before reloading
 * to the newly deployed app bundle so zero answers are ever lost on a site update.
 */
export async function flushAndSafeReload(reason: string): Promise<boolean> {
  if (reloadInProgress) return false;
  if (!canSafeReloadNow()) return false;
  reloadInProgress = true;

  try {
    if (registeredFlusher) {
      await Promise.race([
        registeredFlusher().catch(() => {}),
        new Promise<void>((resolve) => setTimeout(resolve, 3500)),
      ]);
    }
  } catch {
    // Local backup already saved synchronously
  }

  void logSubmissionError({
    step: "site_update",
    error: new Error(reason),
  });

  try {
    const session = getActiveCoupleSession();
    const isAdminRoute =
      typeof window !== "undefined" &&
      window.location.pathname.startsWith("/admin");

    if (!isAdminRoute && session?.resumeToken) {
      window.location.replace(
        buildResumeUrl(session.resumeToken, window.location.origin)
      );
    } else if (typeof window !== "undefined") {
      window.location.reload();
    }
  } catch {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }
  return true;
}

/**
 * Checks `/version.json` to detect if a new Vercel deployment went live while
 * the couple had the form open. Returns true if a newer build is detected.
 */
export async function checkForNewDeployment(
  fetchImpl: typeof fetch = fetch,
  currentBuildIdOverride?: string
): Promise<boolean> {
  const currentBuildId = currentBuildIdOverride ?? getCurrentBuildId();
  if (!currentBuildId || currentBuildId === "dev") {
    return false;
  }
  try {
    const res = await fetchImpl(`/version.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { buildId?: string };
    if (data?.buildId && data.buildId !== currentBuildId) {
      return true;
    }
  } catch {
    // Offline or dev server without version.json
  }
  return false;
}

/**
 * Installs global listeners for Vite preload/chunk errors and periodic version checks
 * so deploying an update while a couple is filling out the form never breaks Send.
 */
export function installSiteUpdateGuard(
  onUpdateDetected?: () => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const handleChunkFailure = (reason: string) => {
    onUpdateDetected?.();
    void flushAndSafeReload(reason);
  };

  const onVitePreloadError = (event: Event) => {
    event.preventDefault();
    handleChunkFailure("vite:preloadError");
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (isChunkLoadError(event.reason)) {
      event.preventDefault();
      handleChunkFailure("chunk_load_rejection");
    }
  };

  const runVersionPoll = async () => {
    if (document.visibilityState !== "visible") return;
    const hasUpdate = await checkForNewDeployment();
    if (hasUpdate) {
      handleChunkFailure("new_deployment_detected");
    }
  };

  window.addEventListener("vite:preloadError", onVitePreloadError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  const onFocus = () => {
    void runVersionPoll();
  };
  window.addEventListener("focus", onFocus);
  const intervalId = window.setInterval(() => {
    void runVersionPoll();
  }, 180_000);

  return () => {
    window.removeEventListener("vite:preloadError", onVitePreloadError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    window.removeEventListener("focus", onFocus);
    window.clearInterval(intervalId);
  };
}
