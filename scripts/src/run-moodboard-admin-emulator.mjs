import { writeFile, unlink } from "node:fs/promises";
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const configPath = path.join(root, ".firebase-emulator.json");
const logDir = path.join(root, "generated-artifacts/moodboard-admin-emulator");
const projectId = "oaks-couple-questionnaire";
mkdirSync(logDir, { recursive: true });
const stdoutPath = path.join(logDir, "firebase.stdout.log");
const stderrPath = path.join(logDir, "firebase.stderr.log");
const stdoutFd = openSync(stdoutPath, "w");
const stderrFd = openSync(stderrPath, "w");
await writeFile(configPath, JSON.stringify({
  firestore: { rules: "firestore.rules" },
  storage: { rules: "storage.rules" },
  emulators: {
    auth: { host: "127.0.0.1", port: 29099 },
    firestore: { host: "127.0.0.1", port: 28080 },
    storage: { host: "127.0.0.1", port: 29199 },
    hub: { host: "127.0.0.1", port: 24400 },
    logging: { host: "127.0.0.1", port: 24500 },
    ui: { enabled: false },
    singleProjectMode: true,
  },
}, null, 2));

const result = spawnSync("pnpm", [
  "dlx",
  "firebase-tools@15.37.0",
  "emulators:exec",
  "--project",
  projectId,
  "--config",
  configPath,
  "--only",
  "auth,firestore,storage",
  "node scripts/src/moodboard-admin-smoke.mjs",
], {
  cwd: root,
  stdio: ["inherit", stdoutFd, stderrFd],
  env: {
    ...process.env,
    VITE_USE_FIREBASE_EMULATORS: "true",
    VITE_FIREBASE_EMULATOR_PROJECT_ID: projectId,
  },
});

closeSync(stdoutFd);
closeSync(stderrFd);
const redactEmulatorOutput = (text = "") => text
  .replace(/To verify the email address [^,]+, follow this link: [^\s]+/g, "Auth emulator generated a local verification link (redacted).")
  .replace(/oobCode=[^&\s]+/g, "oobCode=[redacted]");
process.stdout.write(redactEmulatorOutput(readFileSync(stdoutPath, "utf8")));
process.stderr.write(redactEmulatorOutput(readFileSync(stderrPath, "utf8")));

try {
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await unlink(configPath).catch(() => {});
  for (const logPath of [stdoutPath, stderrPath]) unlinkSync(logPath);
}
