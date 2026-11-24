# OAKS Wedding — Our Story

The existing OAKS Wedding couple questionnaire and studio dashboard, imported from Vercel without redesigning its pages or changing its data provider.

## Run and verify

- Frontend workflow: `artifacts/oaks-questionnaire: web`
- Backend workflow: `artifacts/api-server: API Server`
- Unit and reliability tests: `pnpm --filter @workspace/oaks-questionnaire test`
- Backend access/size/quota tests: `pnpm --filter @workspace/api-server test`
- Safe browser smoke test: `node scripts/src/oaks-smoke.mjs`
- Frontend typecheck: `pnpm --filter @workspace/oaks-questionnaire typecheck`
- Backend typecheck: `pnpm --filter @workspace/api-server typecheck`
- API code generation: `pnpm --filter @workspace/api-spec run codegen`

Start services through their managed workflows, which supply the required port and path configuration. The frontend is served at `/`; Express handles `/api`.

## Project layout

- `artifacts/oaks-questionnaire/`: original React pages, questionnaire, styling, fonts, and public assets.
- `artifacts/api-server/src/routes/ai.ts`: original Gemini prompts and handlers, moved out of the development-only Vite plugin so they also run in production.
- `artifacts/api-server/src/routes/notify.ts`: original email notification and receipt handler.
- `lib/api-spec/openapi.yaml`: contracts for the imported endpoints.
- `firestore.rules`, `storage.rules`: preserved Firebase rules for the existing project; migration does not deploy or change these rules.
- `.migration-backup/`: untouched import reference; excluded from publishing.

## Preserve existing services and data

Keep the existing Firebase authentication, Firestore records, Storage uploads, anonymous couple sessions, and admin allowlist. Do not replace them with PostgreSQL or a new identity provider as part of migration work.

**Why:** This is a port of an existing product, not a rebuild. Switching providers would disconnect the studio from its existing couples and photos.

Do not submit synthetic questionnaires to the live Firebase project while testing. The browser smoke test blocks Firebase network requests and checks local draft recovery without creating records. Signed-in admin data, cross-device recovery, and real uploads require an authorized test account and separate verification.

## External service configuration

These values were not supplied with the import:

- `GEMINI_API_KEY`: server-only key for original Gemini generation and live-token endpoints.
- `RESEND_API_KEY`: server-only Resend email credential.
- `NOTIFY_EMAILS`: comma-separated studio notification recipients.
- Optional `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO`: override the original sender and reply-to defaults.
- Optional `VITE_PUBLIC_APP_URL`: public origin for resume links; leave unset to use the current origin. Do not set it to a development URL for production.

Use Replit Secrets for credentials. Never expose server keys through Vite. Until configured, service endpoints return explicit errors; the original client-side deterministic brief/letter fallbacks remain intact.

Firebase sign-in from a new Replit domain may require adding that domain to the existing Firebase project's authorized domains. Keep the current Firebase configuration and verify with the project owner rather than replacing it.

## Migration-specific behavior

- Vercel Analytics is removed; the app no longer calls the Vercel analytics endpoint.
- Production builds retain the original `version.json` manifest and matching build identifier, needed for safe mid-session updates.
- AI generation requires a signed Firebase ID token and server-verified studio access. The server checks the existing built-in verified team policy or the caller's active Firestore admin record. Keep its built-in policy aligned with Firebase rules.
- AI input is capped at 256 KB; prompts at 60,000 characters. Per server process, generation is limited to 8 requests per admin per 10 minutes, 40 per admin per day, 500 total per day, and 2 simultaneous calls. Provider calls have a 45-second timeout and 8,192 output-token cap. These counters reset on restart; configure provider-level billing quotas before enabling paid production usage.
- `/admin`, `/admin/checklist`, and `/admin/couple/:id` remain protected by the original Firebase admin access checks.
- Unit tests include mocked email-provider delivery; they do not send messages.
- Browser screenshots are generated under `generated-artifacts/`, excluded from Git and publishing.
