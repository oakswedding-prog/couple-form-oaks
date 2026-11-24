import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

// Never write test couples to the imported, live Firebase project.
// Cloud persistence must be verified separately with an authorized test account.
const origin = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : "http://localhost:80";
const output = "generated-artifacts/oaks-smoke";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/repl/tools/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.route("**/firestore.googleapis.com/**", (route) => route.abort());
await context.route("**/identitytoolkit.googleapis.com/**", (route) => route.abort());
await context.route("**/securetoken.googleapis.com/**", (route) => route.abort());
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /let.s get to know/i }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: `${output}/welcome-mobile.jpg`, fullPage: true });
  await page.getByPlaceholder("e.g. Maya", { exact: true }).fill("MigrationTest");
  await page.getByPlaceholder("e.g. Leo", { exact: true }).fill("PreviewOnly");
  await page.locator('input[type="date"]').fill("2027-06-12");
  await page.getByPlaceholder("e.g. maya@example.com", { exact: true }).fill("migration-check@example.com");
  await page.getByRole("button", { name: "Begin Questionnaire" }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByPlaceholder("e.g. Honey, Meeru").fill("Test nickname one");
  await page.getByPlaceholder("e.g. Captain, Aaru").fill("Test nickname two");
  await page.screenshot({ path: `${output}/question-one-mobile.jpg`, fullPage: true });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByPlaceholder(/What does MigrationTest do/).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  // The original app may reopen directly at the saved step, or show Resume.
  const resume = page.getByRole("button", { name: /resume/i }).first();
  if (await resume.isVisible()) await resume.click();
  await page.getByPlaceholder(/What does MigrationTest do/).waitFor();
  await page.getByRole("button", { name: /back/i }).click();
  assert.equal(await page.getByPlaceholder("e.g. Honey, Meeru").inputValue(), "Test nickname one");
  assert.equal(await page.getByPlaceholder("e.g. Captain, Aaru").inputValue(), "Test nickname two");
  await page.goto(`${origin}/admin`, { waitUntil: "networkidle" });
  await page.locator('input[type="password"]').waitFor();
  await page.screenshot({ path: `${output}/admin-login-mobile.jpg`, fullPage: true });
  assert.deepEqual(errors, [], "No uncaught browser errors");
  console.log("PASS: mobile welcome, start, chapter, next/back, reload persistence, admin sign-in gate.");
  console.log("Cloud requests deliberately blocked: no live Firebase records, emails, or uploads created.");
} finally {
  await context.close();
  await browser.close();
}
