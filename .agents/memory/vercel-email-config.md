---
name: Vercel email settings drift
description: Live (Vercel) email settings are separate from Replit secrets and can silently break studio alerts
---
Vercel production has its own RESEND_API_KEY / NOTIFY_EMAILS / RESEND_FROM_EMAIL, independent of Replit secrets. In Nov 2026 the Vercel key was invalid (401) and the sender was outside the verified domain mail.oakswedding.com, so every live submission showed "Email not sent" while Replit tests passed.
**Why:** a passing Replit test proved nothing about the live site.
**How to apply:** when emails fail, POST a labelled test to the live /api/notify first; sync values from Replit secrets via the Vercel connection without printing them; sender must be on mail.oakswedding.com.
