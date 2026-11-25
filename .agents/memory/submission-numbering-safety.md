---
name: Submission numbering safety
description: Product intent and rollout constraints for gap-free submission labels
---
Submission numbers are mutable display labels, ordered by original submission time. Deletion closes gaps; stable document IDs, Storage paths, and resume links must not change when labels change.

**Why:** The user explicitly requested gap-free numbering without changing the questionnaire, login, links, or stored photo locations.

**How to apply:** Never use a display number as an identifier. Numbering and parent deletion must commit together through trusted server transactions. Refuse updates that cannot fit in one atomic operation rather than silently splitting them.

Coordinate the server Firebase credential, Vercel deployment, and Firestore rules before announcing this feature live. Do not publish restrictive number-write rules while an older client still assigns numbers directly.

**Why:** Couples must be unable to edit number fields or the counter. Trusted assignment therefore needs a configured private server credential, separately in Replit and Vercel.

**How to apply:** Verify both environments independently. Never put a Firebase Admin credential in browser-prefixed environment variables. A saved form whose numbering failed must remain available for recovery, with an explicit diagnostic rather than an invented number.

Vercel can report a deployment as ready while a serverless function still fails on invocation. Workspace TypeScript source may not be included in the function bundle, and the Firebase Admin Auth entry can hit a CommonJS/ESM incompatibility in the Vercel runtime.

**Why:** A successful frontend build did not prove the trusted numbering endpoint could load or authenticate requests.

**How to apply:** Compile the shared service to JavaScript before Vercel packages functions, explicitly include its output, and verify a live invalid-token request returns an authentication error rather than a function crash. Production identity validation can use Firebase's token-lookup endpoint; keep emulator verification separate.
