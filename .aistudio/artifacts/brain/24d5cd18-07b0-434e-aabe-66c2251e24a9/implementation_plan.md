# Implementation Plan: Email & Password Admin Login & Firebase Auth Fix

Add email/password authentication alongside Google Sign-In on the Admin portal, resolve the `auth/unauthorized-domain` error, and adjust security rules so accounts added in Firebase Authentication can access the dashboard.

---

### 1. Root Cause Analysis

1. **`Firebase: Error (auth/unauthorized-domain)`**:
   - Google Sign-In uses an OAuth popup/redirect flow. Firebase Authentication restricts OAuth sign-in to domains listed in **Firebase Console > Authentication > Settings > Authorized domains**.
   - The current preview environment domain (`run.app`) and your production Vercel domain must be added to this list for Google popup sign-in to complete.
2. **Missing Email & Password Option**:
   - The admin login interface previously only had the "Sign in with Google" button.
   - Firebase Authentication already has your team user created, but the app needed the email and password inputs and the `signInWithEmailAndPassword` SDK call.
3. **Firestore Security Rule Verification**:
   - `firestore.rules` currently checks `request.auth.token.email_verified == true`.
   - Users manually added in Firebase Console (`mywedding@oakswedding.com`) have `email_verified: false` by default, which causes Firestore to block data access.
   - We will update the `isAdmin()` rule to check `request.auth != null && exists(/databases/$(database)/documents/admins/$(request.auth.token.email.lower()))`, ensuring both Google and Email/Password team accounts are authenticated and permitted.

---

### 2. User Review Required

> [!IMPORTANT]
> **Firebase Console Action Required for Google Sign-In**:
> To allow Google popup login, go to **Firebase Console > Authentication > Settings > Authorized domains** and add:
> - `localhost`
> - `run.app` (covers AI Studio preview)
> - Your Vercel domain (e.g. `your-app.vercel.app` or custom domain)
> 
> *Email & Password sign-in does not require domain whitelisting and will work immediately once deployed.*

---

### 3. Proposed Changes

#### Authentication Service (`src/lib/auth.ts`)
- Import `signInWithEmailAndPassword` from `firebase/auth`.
- Add `signInWithEmail(email: string, password: string)` method to `AdminAuthState`.
- Provide friendly error handling for common Firebase error codes:
  - `auth/invalid-credential`, `auth/user-not-found`, `auth/wrong-password` → *"Incorrect email or password. Please try again."*
  - `auth/unauthorized-domain` → *"This domain is not authorized in Firebase. Please add this domain under Authentication > Settings > Authorized domains."*
  - `auth/too-many-requests` → *"Too many failed login attempts. Please wait a few minutes."*

#### Admin Login Page (`src/pages/AdminLogin.tsx`)
- Display both **Google Sign-In** and **Email & Password** fields together on the card as requested.
- Top: "Sign in with Google" button.
- Middle: Elegant divider line (`or continue with email`).
- Bottom:
  - **Email** input field (styled in OAKS design).
  - **Password** input field with password show/hide eye icon.
  - **Sign In with Email** button (dark luxury button with loading state).
- When signed in with an account not present in the Firestore `admins` collection, continue showing the clear unauthorized notice with sign-out option.

#### Security Rules (`firestore.rules` & `storage.rules`)
- Remove the strict `email_verified == true` requirement for the `isAdmin()` helper so team members created via Firebase Console Email/Password are allowed as long as their email is in the `admins` collection.

---

### 4. Verification Plan

1. **Compilation & Linting**:
   - Run `lint_applet` and `compile_applet` to ensure zero TypeScript or build errors.
2. **UI & Flow Verification**:
   - Verify that `/admin` renders the Google button, divider, email and password inputs, and submit button.
   - Test password visibility toggle and form validation (empty fields, invalid credentials handling).
   - Verify loading and error states display clearly.
