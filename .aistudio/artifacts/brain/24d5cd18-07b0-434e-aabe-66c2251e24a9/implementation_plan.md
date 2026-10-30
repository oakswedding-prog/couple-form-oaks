# Private Admin Dashboard & Shoot Day Cheat Sheet

A private, secure dashboard for the OAKS Wedding team to manage couple submissions, view the 60-second Shoot Day Cheat Sheet, export branded PDF and Word (.docx) briefs, and track wedding timelines—backed by production Firebase (Firestore, Auth, and Storage) in Mumbai (`asia-south1`).

---

### User Review & Critical Decisions

> [!IMPORTANT]
> - **Firebase Connected**: Connected directly to your existing Firebase project `oaks-couple-questionnaire` (`asia-south1`).
> - **Server-Enforced Zero-Trust Security**: Couples can only write submissions and upload photos; they can never read, modify, or list other submissions. Only Google accounts in the admin allow-list can read data or access `/admin`.
> - **Sequential Numbering**: Submissions are numbered chronologically (`#001`, `#002`, `#003`...) using an atomic Firestore transaction so numbers never collide or change.
> - **Branded Exports & Cheat Sheet**: Includes a dedicated 1-page printable Shoot Day Cheat Sheet, plus client-side PDF (`jspdf`) and Word `.docx` (`docx` library) generators formatted with OAKS branding.
> - **Resend Email Notification**: `/api/notify` triggers an alert to `NOTIFY_EMAILS` using `RESEND_API_KEY`, failing silently if unconfigured so couples are never blocked.

---

### 1. Overview & Core Concept

1. **Couples' Form (Public)**:
   - Couples fill out their story at `/`.
   - On the welcome screen, new required fields: **Wedding Date** (date picker), **Phone / WhatsApp number**, and **Email** (at least one of phone or email required).
   - Subtle lock icon in top-right corner linking to `/admin`.
   - On "Send", the entire submission is saved to Firestore with automatic retry, and images are uploaded to Firebase Storage.
2. **Private Admin Dashboard (`/admin`)**:
   - Google Sign-In gate. Only allow-listed team emails can access.
   - Summary metric chips (Total, New, Reviewed, Shared with team).
   - Search by partner names, status filter, and sorting (Newest or Wedding date soonest).
   - Rows (cards on mobile) showing sequential number (`#001`), couple names, wedding date with countdown badge (`in 45 days`), date submitted, status dropdown, View button, and Download menu.
3. **Couple View (`/admin/couple/:id`)**:
   - **Shoot Day Cheat Sheet** displayed first: A high-density, beautiful 1-page summary for photographers/filmmakers on wedding morning (Non-negotiables, Must-capture/Avoid, Key people, camera comfort, emotional moments, 3 words, future feelings quote).
   - Dedicated print button that cleanly prints the cheat sheet on a single A4 page in black & white.
   - Full categorized answers with exact question text, clickable links, interactive image gallery, and family member cards.
   - Auto-saving **Private Team Notes** box.
4. **Branded Downloads**:
   - **PDF Brief** & **Word (.docx)**: Branded with OAKS logo, header metadata, the Cheat Sheet on page 1, followed by full chapter answers.

---

### 2. User Experience & Visual Design

- **Aesthetic**: Warm minimalism, editorial typography (`Playfair Display` serif headers, clean sans body), warm cream cards (`#FAF8F5`), soft gold accents (`#B08D57`), charcoal text (`#1A1A1A`).
- **Dashboard Layout**:
  - Desktop-first table with spacious padding, soft hover states, and clear tag chips.
  - Responsive stacking to cards on tablet and mobile viewports.
  - Status dropdowns: `New` (warm gold), `Reviewed` (soft blue), `Shared with team` (soft green).
- **Shoot Day Cheat Sheet Design**:
  - High-impact visual hierarchy designed for 60-second scanning under sunlight on shoot morning.
  - High-contrast non-negotiables box with bold accent border.
  - Side-by-side 2-column grid for "Must Capture" vs "Please Avoid".
  - Dedicated `@media print` rules hiding top navigation, headers, and full questionnaire so only the 1-page cheat sheet prints.

---

### 3. Key Product Decisions & Security Architecture

#### A. Database Schema (`firestore`)

1. **`counters/submissions`**:
   - Document: `current: number`
   - Atomically incremented via Firestore transaction during submission to assign `#001`, `#002`, etc.
2. **`submissions/{submissionId}`**:
   - `id`: string
   - `submissionNumber`: string (e.g. `"#001"`)
   - `sequenceIndex`: number (e.g. `1`)
   - `submittedAt`: timestamp (`request.time`)
   - `status`: `"new" | "reviewed" | "shared"`
   - `partner1Name`: string
   - `partner2Name`: string
   - `weddingDate`: string (YYYY-MM-DD)
   - `phone`: string
   - `email`: string
   - `answers`: Map of `{ questionId: { questionNumber, questionText, answer } }`
   - `familyMembers`: Array of `{ name, relationship, side, mustCapture }`
   - `uploadedImages`: Array of `{ url, path, name }`
   - `links`: Array of string
   - `privateNotes`: string (admin editable only)
3. **`admins/{email}`**:
   - Documents storing allowed admin emails: `{ email: string, addedAt: timestamp }`
   - Allows changing the allow-list in Firestore without touching code or redeploying rules.

#### B. Storage Schema (`storage`)

- Path: `/submissions/{submissionId}/{filename}`
- Only images allowed (`image/jpeg`, `image/png`, `image/webp`), size <= 10MB.
- Public/Couples can write once during submission. Only authenticated admins can read.

---

### 4. Step-by-Step Firebase Console Instructions

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Set Up Google Authentication                             │
│    - Go to Firebase Console > Authentication > Sign-in      │
│      method > Add Google Provider > Enable & Save.          │
│                                                             │
│ 2. Initialize the Admins Collection                         │
│    - Go to Firestore Database > Start Collection "admins"   │
│    - Add Document with ID: your email (e.g.                 │
│      "mywedding@oakswedding.com")                           │
│    - Fields: email (string): "mywedding@oakswedding.com"    │
│                                                             │
│ 3. Paste Firestore Rules                                    │
│    - Go to Firestore Database > Rules > Paste & Publish.    │
│                                                             │
│ 4. Paste Storage Rules                                      │
│    - Go to Storage > Rules > Paste & Publish.               │
└─────────────────────────────────────────────────────────────┘
```

#### Exact Firestore Security Rules:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Default deny
    match /{document=**} {
      allow read, write: if false;
    }

    // Helper: Check if user is authenticated with Google and in admin allow-list
    function isAdmin() {
      return request.auth != null 
        && request.auth.token.email_verified == true
        && exists(/databases/$(database)/documents/admins/$(request.auth.token.email.lower()));
    }

    // Admins allow-list collection: read-only for admins
    match /admins/{email} {
      allow read: if isAdmin();
      allow write: if false;
    }

    // Submission counter: readable/incrementable by anyone creating a submission, read/update by admin
    match /counters/{counterId} {
      allow read, write: if true;
    }

    // Submissions collection:
    // - Couples can CREATE once (write-only). They can never read, update, or delete.
    // - Admins can read (list/get), update (status, notes), and manage submissions.
    match /submissions/{submissionId} {
      allow create: if request.resource.data.keys().hasAll(['partner1Name', 'partner2Name', 'weddingDate'])
                    && (request.resource.data.phone != '' || request.resource.data.email != '');
      allow read: if isAdmin();
      allow update: if isAdmin();
      allow delete: if false; // Deletion disabled as specified
    }
  }
}
```

#### Exact Storage Security Rules:
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    
    // Check if user is authenticated admin
    function isAdmin() {
      return request.auth != null 
        && request.auth.token.email_verified == true
        && firestore.exists(/databases/(default)/documents/admins/$(request.auth.token.email.lower()));
    }

    // Submissions storage:
    // Couples can upload images up to 10MB
    // Only admins can read/view uploaded images
    match /submissions/{submissionId}/{fileName} {
      allow write: if request.resource.size < 10 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
      allow read: if isAdmin();
    }
  }
}
```

---

### 5. Technical Implementation Blueprint

1. **Dependencies to Install**:
   - `firebase`: Firebase SDK v11 (Auth, Firestore, Storage)
   - `jspdf` & `jspdf-autotable`: Client-side branded PDF generator
   - `docx`: Client-side Microsoft Word document generator
   - `canvas-confetti`: Submissions celebratory UX
2. **Configuration**:
   - `src/lib/firebase.ts`: Initialize Firebase with the provided config (`oaks-couple-questionnaire`).
   - `src/lib/auth.ts`: Authentication state hook, Google popup login, and admin verification against the `admins` collection.
3. **Components to Create/Update**:
   - `src/components/WelcomeScreen.tsx`: Add Wedding Date picker, Phone, and Email fields with validation. Add discrete lock icon button in top right opening `/admin`.
   - `src/pages/AdminLogin.tsx`: Elegant OAKS branded Google login screen with access check and error notification for unauthorized accounts.
   - `src/pages/AdminDashboard.tsx`: High-end couples table, search, status filters, counters, countdown badges, and dropdowns.
   - `src/pages/AdminCoupleDetail.tsx`: Comprehensive read-only view featuring the Shoot Day Cheat Sheet, chapter review, family members, image gallery, and auto-saving notes.
   - `src/components/ShootDayCheatSheet.tsx`: High-density 1-page visual summary with `@media print` CSS.
   - `src/utils/exportBrief.ts`: Branded PDF and `.docx` generation with OAKS logo, Cheat Sheet on page 1, and formatted Q&A tables.
   - `api/notify.ts`: Vercel serverless function with Resend integration.
4. **Vercel Routing**:
   - `vercel.json`: Ensure `"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]` is in place so `/admin` and `/admin/couple/:id` load seamlessly on refresh.
