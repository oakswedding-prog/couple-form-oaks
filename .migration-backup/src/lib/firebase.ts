/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: "AIzaSyDWpU42Owb-yd2YvrUPJyb9A5VC_UYZUtw",
  authDomain: "oaks-couple-questionnaire.firebaseapp.com",
  projectId: "oaks-couple-questionnaire",
  storageBucket: "oaks-couple-questionnaire.firebasestorage.app",
  messagingSenderId: "658036640732",
  appId: "1:658036640732:web:41aa470173ce73d945dd19",
};

// Initialize Firebase singleton
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account",
});
