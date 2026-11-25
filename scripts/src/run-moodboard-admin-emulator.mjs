import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const emulatorDir = path.join(root, "generated-artifacts/moodboard-admin-emulator");
const configPath = path.join(emulatorDir, "firebase.json");
await mkdir(emulatorDir, { recursive: true });
await writeFile(configPath, JSON.stringify({
  firestore: { rules: "../../firestore.rules" },
  storage: { rules: "../../storage.rules" },
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
  "oaks-couple-questionnaire",
  "--config",
  configPath,
  "--only",
  "auth,firestore,storage",
  "node scripts/src/moodboard-admin-smoke.mjs",
], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
