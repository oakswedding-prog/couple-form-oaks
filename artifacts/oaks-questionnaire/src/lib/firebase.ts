/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";

const useFirebaseEmulators =
  typeof import.meta.env !== "undefined"
  && import.meta.env.DEV === true
  && import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";
const emulatorProjectId = import.meta.env?.VITE_FIREBASE_EMULATOR_PROJECT_ID || "demo-oaks-moodboard";

export const firebaseConfig = {
  apiKey: "AIzaSyDWpU42Owb-yd2YvrUPJyb9A5VC_UYZUtw",
  authDomain: "oaks-couple-questionnaire.firebaseapp.com",
  projectId: useFirebaseEmulators ? emulatorProjectId : "oaks-couple-questionnaire",
  storageBucket: useFirebaseEmulators
    ? `${emulatorProjectId}.appspot.com`
    : "oaks-couple-questionnaire.firebasestorage.app",
  messagingSenderId: "658036640732",
  appId: "1:658036640732:web:41aa470173ce73d945dd19",
};

// Initialize Firebase singleton
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Local end-to-end checks use dedicated emulators and never write to production.
if (useFirebaseEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:29099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 28080);
  connectStorageEmulator(storage, "127.0.0.1", 29199);
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account",
});
