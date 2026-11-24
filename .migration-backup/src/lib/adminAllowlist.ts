/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const AUTHORIZED_ADMIN_EMAILS = [
  "rahulratna88@gmail.com",
  "mywedding@oakswedding.com",
  "oaksoperations@gmail.com",
] as const;

export function normalizeAdminEmail(email: string | null | undefined): string {
  if (!email) return "";
  return email.trim().toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, "");
}

export function isAllowlistedAdminEmail(email: string | null | undefined): boolean {
  const clean = normalizeAdminEmail(email);
  return Boolean(clean && (AUTHORIZED_ADMIN_EMAILS as readonly string[]).includes(clean));
}
