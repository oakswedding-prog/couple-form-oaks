/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { RefreshCw } from "lucide-react";
import { flushAndSafeReload, isChunkLoadError } from "../lib/versionGuard.ts";
import { logSubmissionError } from "../lib/errorLogger.ts";

interface AppErrorBoundaryState {
  hasError: boolean;
  isUpdating: boolean;
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, isUpdating: false };
  }

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      isUpdating: isChunkLoadError(error),
    };
  }

  componentDidCatch(error: unknown) {
    if (isChunkLoadError(error)) {
      void flushAndSafeReload("error_boundary_chunk_load");
    } else {
      void logSubmissionError({
        step: "ui_error_boundary",
        error,
      });
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-[100dvh] bg-[#FAF8F5] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-[#E5DDD2] rounded-3xl p-8 text-center space-y-4 shadow-xs">
          <h1 className="font-cormorant text-2xl sm:text-3xl text-[#1A1A1A] font-semibold">
            {this.state.isUpdating
              ? "Updating to the latest version…"
              : "Your answers are safe"}
          </h1>
          <p className="text-sm text-[#5F5F5F] leading-relaxed">
            {this.state.isUpdating
              ? "We published a quick update while you had the form open. Refreshing now with all your saved answers intact."
              : "Something unexpected interrupted this screen, but your answers are saved. Tap below to continue right where you left off."}
          </p>
          <button
            type="button"
            onClick={() => void flushAndSafeReload("manual_error_boundary_refresh")}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[#1A1A1A] text-white text-sm font-medium hover:bg-[#333333] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 text-[#E5C687]" />
            <span>Continue safely</span>
          </button>
        </div>
      </div>
    );
  }
}
