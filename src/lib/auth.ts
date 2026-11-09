/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import {
  User,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, googleProvider, db } from "./firebase.ts";

export interface AdminAuthState {
  user: User | null;
  isAdmin: boolean;
  isLoading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<{ success: boolean; message: string }>;
  clearError: () => void;
  signOut: () => Promise<void>;
}

export async function checkIsAdmin(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  try {
    const adminRef = doc(db, "admins", email.toLowerCase().trim());
    const snapshot = await getDoc(adminRef);
    if (snapshot.exists()) {
      const data = snapshot.data();
      // If doc exists and active is not explicitly false, allow access
      return data?.active !== false;
    }
    return false;
  } catch (err) {
    console.error("Error verifying admin status:", err);
    return false;
  }
}

export function useAdminAuth(): AdminAuthState {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser && currentUser.email) {
        setIsLoading(true);
        try {
          const verified = await checkIsAdmin(currentUser.email);
          setIsAdmin(verified);
          if (!verified) {
            setError(`Account ${currentUser.email} does not have admin permissions.`);
          } else {
            setError(null);
          }
        } catch (err: any) {
          setError(err?.message || "Failed to verify administrator privileges.");
          setIsAdmin(false);
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsAdmin(false);
        setIsLoading(false);
        setError(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user?.email) {
        const verified = await checkIsAdmin(result.user.email);
        setIsAdmin(verified);
        if (!verified) {
          setError(`Account ${result.user.email} does not have admin permissions.`);
        }
      }
    } catch (err: any) {
      if (err?.code === "auth/unauthorized-domain") {
        const currentHost = typeof window !== "undefined" ? window.location.hostname : "this domain";
        setError(
          `Domain not authorized in Firebase (${currentHost}). In Firebase Console, go to Authentication > Settings > Authorized domains and add "${currentHost}" (or use Email & Password below).`
        );
      } else if (err?.code !== "auth/popup-closed-by-user") {
        setError(err?.message || "Google Sign In was not completed.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      // Clean email: trim, lowercase, remove invisible unicode whitespace
      const cleanEmail = email.trim().toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, "");
      // Clean password: remove trailing newlines, carriage returns, zero-width or non-breaking spaces
      const trimmedPassword = password.replace(/[\r\n\u200B-\u200D\uFEFF]/g, "").trim();

      let result: any = null;
      let lastErr: any = null;

      // 1. Try with sanitized trimmed password (solves trailing copy-paste spaces from WhatsApp/Slack/macOS)
      try {
        result = await signInWithEmailAndPassword(auth, cleanEmail, trimmedPassword);
      } catch (err: any) {
        lastErr = err;
        // 2. If password had spaces and trimmed failed, try raw password just in case
        if (password !== trimmedPassword && (err?.code === "auth/invalid-credential" || err?.code === "auth/wrong-password")) {
          try {
            result = await signInWithEmailAndPassword(auth, cleanEmail, password);
          } catch (secondErr: any) {
            lastErr = secondErr;
          }
        }
      }

      if (!result && lastErr) {
        throw lastErr;
      }

      if (result?.user?.email) {
        const verified = await checkIsAdmin(result.user.email);
        setIsAdmin(verified);
        if (!verified) {
          setError(`Account ${result.user.email} does not have admin permissions in the database.`);
        }
      }
    } catch (err: any) {
      console.error("Email sign-in error:", err);
      if (
        err?.code === "auth/invalid-credential" ||
        err?.code === "auth/wrong-password" ||
        err?.code === "auth/user-not-found"
      ) {
        setError(
          "Incorrect email or password. Please verify your credentials or use 'Forgot password?' below to set a new password."
        );
      } else if (err?.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else if (err?.code === "auth/too-many-requests") {
        setError(
          "Access to this account is temporarily paused by Firebase due to repeated failed login attempts. Please click 'Forgot password?' below to reset it immediately, or wait 15 minutes."
        );
      } else if (err?.code === "auth/unauthorized-domain") {
        setError("Domain not authorized in Firebase. Add this domain in Firebase Console under Authentication > Settings > Authorized domains.");
      } else {
        setError(err?.message || "Could not sign in with email.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const sendPasswordReset = async (
    targetEmail: string
  ): Promise<{ success: boolean; message: string }> => {
    const cleanEmail = targetEmail.trim().toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, "");
    if (!cleanEmail) {
      return { success: false, message: "Please enter your email address first." };
    }
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      return {
        success: true,
        message: `Password reset link sent to ${cleanEmail}. Please check your inbox (and Spam/Junk folder) to create a new password.`,
      };
    } catch (err: any) {
      console.error("Password reset error:", err);
      if (err?.code === "auth/too-many-requests") {
        return {
          success: false,
          message: "Too many reset requests. Please wait a few minutes and try again.",
        };
      }
      return {
        success: false,
        message: err?.message || "Failed to send reset link. Please try again.",
      };
    }
  };

  const clearError = () => setError(null);

  const signOut = async () => {
    setIsLoading(true);
    try {
      await fbSignOut(auth);
      setUser(null);
      setIsAdmin(false);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to sign out.");
    } finally {
      setIsLoading(false);
    }
  };

  return {
    user,
    isAdmin,
    isLoading,
    error,
    signIn,
    signInWithEmail,
    sendPasswordReset,
    clearError,
    signOut,
  };
}
