/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Lock, LogOut, ShieldAlert } from "lucide-react";
import { STUDIO_NAME, STUDIO_LOGO_URL } from "../constants.ts";
import { useAdminAuth } from "../lib/auth.ts";

interface AdminLoginProps {
  onBackToForm: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onBackToForm }) => {
  const { user, isAdmin, isLoading, error, signIn, signOut } = useAdminAuth();

  return (
    <div className="min-h-[100dvh] bg-[#FAF8F5] flex flex-col justify-between px-5 py-8 sm:py-12 safe-bottom safe-top">
      {/* Top Bar */}
      <div className="max-w-md w-full mx-auto flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToForm}
          className="text-xs uppercase tracking-wider text-[#7A756D] hover:text-[#1A1A1A] transition-colors py-1 cursor-pointer"
        >
          ← Return to Couples' Form
        </button>
      </div>

      {/* Main Login Card */}
      <div className="max-w-md w-full mx-auto my-auto bg-white border border-[#E5DDD2] rounded-3xl p-8 sm:p-10 shadow-sm text-center">
        {/* Studio Logo */}
        <div className="mb-6">
          <img
            src={
              STUDIO_LOGO_URL ||
              "https://res.cloudinary.com/pcodbmuo/image/upload/v1792483927/Black_OAKS_uctgsb.webp"
            }
            alt={STUDIO_NAME}
            className="h-14 sm:h-16 w-auto max-w-[200px] object-contain mx-auto"
          />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAF7F2] border border-[#E8DFD3] text-[#8C7043] text-xs font-semibold uppercase tracking-wider mb-4">
          <Lock className="w-3.5 h-3.5" />
          <span>Private Studio Admin</span>
        </div>

        <h1 className="font-cormorant text-2xl sm:text-3xl text-[#1A1A1A] font-semibold mb-2">
          Team Portal
        </h1>
        <p className="text-sm text-[#5F5F5F] mb-8 max-w-xs mx-auto leading-relaxed">
          Access couples' questionnaire submissions, download briefs, and view shoot day cheat sheets.
        </p>

        {/* If user is signed in with Google but not in allowlist */}
        {user && !isAdmin && !isLoading ? (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left">
              <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-1">
                <ShieldAlert className="w-4 h-4" />
                <span>This account doesn't have access</span>
              </div>
              <p className="text-xs text-amber-700 leading-relaxed">
                Signed in as <span className="font-semibold">{user.email}</span>. Only email addresses on the team allow-list can access the admin dashboard.
              </p>
            </div>

            <button
              type="button"
              onClick={signOut}
              className="w-full min-h-[50px] py-3 px-5 rounded-full font-cormorant text-lg text-[#1A1A1A] bg-[#FAF8F5] hover:bg-[#F2ECE1] border border-[#E5DDD2] transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-[#8C7043]" />
              <span>Sign out</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-200">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={signIn}
              disabled={isLoading}
              className="w-full min-h-[56px] py-3 px-6 rounded-full font-cormorant text-xl tracking-wide font-medium bg-[#1A1A1A] hover:bg-[#333333] active:scale-[0.99] text-white border border-[#B08D57]/60 shadow-sm transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
            >
              {/* Google G icon */}
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{isLoading ? "Signing in..." : "Sign in with Google"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Footer reassurance */}
      <div className="text-center text-xs font-light text-[#7A756D] py-2">
        Protected studio management console for {STUDIO_NAME} team members.
      </div>
    </div>
  );
};
