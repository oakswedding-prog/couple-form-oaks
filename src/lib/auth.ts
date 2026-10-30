/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import {
  User,
  signInWithPopup,
  signInWithEmailAndPassword,
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
      const cleanEmail = email.trim();
      const result = await signInWithEmailAndPassword(auth, cleanEmail, password);
      if (result.user?.email) {
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
        setError("Incorrect email or password. Please verify your credentials.");
      } else if (err?.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else if (err?.code === "auth/too-many-requests") {
        setError("Too many unsuccessful attempts. Please wait a moment and try again.");
      } else if (err?.code === "auth/unauthorized-domain") {
        setError("Domain not authorized in Firebase. Add this domain in Firebase Console under Authentication > Settings > Authorized domains.");
      } else {
        setError(err?.message || "Could not sign in with email.");
      }
    } finally {
      setIsLoading(false);
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
    clearError,
    signOut,
  };
}
