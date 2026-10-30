/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Lock, LogOut, ShieldAlert, Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";
import { STUDIO_NAME, STUDIO_LOGO_URL } from "../constants.ts";
import { useAdminAuth } from "../lib/auth.ts";

interface AdminLoginProps {
  onBackToForm: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onBackToForm }) => {
  const { user, isAdmin, isLoading, error, signIn, signInWithEmail, clearError, signOut } =
    useAdminAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setIsSubmittingEmail(true);
    try {
      await signInWithEmail(email, password);
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#FAF8F5] flex flex-col justify-between px-4 sm:px-6 py-6 sm:py-10 safe-bottom safe-top">
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
      <div className="max-w-md w-full mx-auto my-auto bg-white border border-[#E5DDD2] rounded-3xl p-6 sm:p-9 shadow-sm text-center">
        {/* Studio Logo */}
        <div className="mb-5">
          <img
            src={
              STUDIO_LOGO_URL ||
              "https://res.cloudinary.com/pcodbmuo/image/upload/v1792483927/Black_OAKS_uctgsb.webp"
            }
            alt={STUDIO_NAME}
            className="h-12 sm:h-14 w-auto max-w-[190px] object-contain mx-auto"
          />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAF7F2] border border-[#E8DFD3] text-[#8C7043] text-xs font-semibold uppercase tracking-wider mb-3">
          <Lock className="w-3.5 h-3.5" />
          <span>Private Studio Admin</span>
        </div>

        <h1 className="font-cormorant text-2xl sm:text-3xl text-[#1A1A1A] font-semibold mb-1.5">
          Team Portal
        </h1>
        <p className="text-xs sm:text-sm text-[#5F5F5F] mb-6 max-w-xs mx-auto leading-relaxed">
          Access couples' questionnaire submissions, download briefs, and view shoot day cheat sheets.
        </p>

        {/* If user is signed in with Firebase but not in Firestore admins allowlist */}
        {user && !isAdmin && !isLoading ? (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left">
              <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-1">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>This account doesn't have access</span>
              </div>
              <p className="text-xs text-amber-700 leading-relaxed">
                Signed in as <span className="font-semibold text-amber-900">{user.email}</span>.
                Only team emails added to the database allow-list can open the dashboard.
              </p>
              <p className="text-[11px] text-amber-600 mt-2">
                Tip: In Firestore Database &gt; <span className="font-mono">admins</span> collection, add a document with ID <span className="font-mono font-semibold">{user.email?.toLowerCase()}</span>.
              </p>
            </div>

            <button
              type="button"
              onClick={signOut}
              className="w-full min-h-[46px] py-2.5 px-5 rounded-full font-cormorant text-lg text-[#1A1A1A] bg-[#FAF8F5] hover:bg-[#F2ECE1] border border-[#E5DDD2] transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-[#8C7043]" />
              <span>Sign out</span>
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {error && (
              <div className="text-xs text-red-600 bg-red-50 p-3.5 rounded-xl border border-red-200 text-left leading-relaxed">
                {error}
              </div>
            )}

            {/* 1. Google Sign In Button */}
            <button
              type="button"
              onClick={() => {
                clearError();
                signIn();
              }}
              disabled={isLoading || isSubmittingEmail}
              className="w-full min-h-[52px] py-3 px-5 rounded-full font-cormorant text-[19px] tracking-wide font-medium bg-[#1A1A1A] hover:bg-[#2A2A2A] active:scale-[0.99] text-white border border-[#B08D57]/60 shadow-xs transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
            >
              {/* Google G icon */}
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
              <span>{isLoading && !isSubmittingEmail ? "Signing in..." : "Sign in with Google"}</span>
            </button>

            {/* Luxury Divider */}
            <div className="relative flex items-center justify-center my-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#E8DFD3]" />
              </div>
              <span className="relative bg-white px-3 font-cormorant italic text-xs tracking-wider text-[#7A756D] uppercase">
                or sign in with email
              </span>
            </div>

            {/* 2. Email & Password Form */}
            <form onSubmit={handleEmailSubmit} className="space-y-3.5 text-left">
              {/* Email Input */}
              <div className="space-y-1">
                <label
                  htmlFor="admin-email-input"
                  className="block font-cormorant tracking-[0.2em] text-[11px] font-semibold text-[#4A453E] uppercase"
                >
                  TEAM EMAIL
                </label>
                <input
                  id="admin-email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. mywedding@oakswedding.com"
                  required
                  autoComplete="email"
                  className="w-full px-4 py-3 font-cormorant text-[17px] text-[#1A1A1A] placeholder:text-[#5F5F5F]/40 bg-[#FAF8F5] border border-[#E5DDD2] rounded-xl focus:outline-hidden focus:border-[#1A1A1A] focus:ring-1 focus:ring-[#B08D57] shadow-2xs"
                />
              </div>

              {/* Password Input */}
              <div className="space-y-1">
                <label
                  htmlFor="admin-password-input"
                  className="block font-cormorant tracking-[0.2em] text-[11px] font-semibold text-[#4A453E] uppercase"
                >
                  PASSWORD
                </label>
                <div className="relative">
                  <input
                    id="admin-password-input"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                    className="w-full pl-4 pr-11 py-3 font-cormorant text-[17px] text-[#1A1A1A] placeholder:text-[#5F5F5F]/40 bg-[#FAF8F5] border border-[#E5DDD2] rounded-xl focus:outline-hidden focus:border-[#1A1A1A] focus:ring-1 focus:ring-[#B08D57] shadow-2xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A756D] hover:text-[#1A1A1A] p-1 cursor-pointer"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit Email Button */}
              <button
                type="submit"
                disabled={isSubmittingEmail || !email.trim() || !password}
                className="w-full min-h-[50px] mt-2 py-3 px-5 rounded-full font-cormorant text-[19px] tracking-wide font-normal bg-[#FAF7F2] hover:bg-[#F2ECE1] text-[#1A1A1A] border border-[#B08D57] shadow-2xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
              >
                {isSubmittingEmail ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#8C7043]" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign in with Email</span>
                    <ArrowRight className="w-4 h-4 text-[#8C7043]" />
                  </>
                )}
              </button>
            </form>
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
