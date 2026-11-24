import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type ErrorRequestHandler } from "express";
import { createAiProtection, verifyFirebaseToken } from "./ai-security";

test("AI routes reject anonymous, invalid, unauthorized, oversized, invalid, and excessive requests", async () => {
  let calls = 0;
  let verified = 0;
  const app = express();
  app.use(express.json({ limit: "256kb" }));
  app.use(createAiProtection({
    verify: async (token) => {
      verified++;
      if (token === "invalid") throw new Error("Bad token");
      return { sub: token, email: "synthetic@example.com" };
    },
    authorize: async (identity) => identity.sub === "studio",
  }));
  app.post("/api/generate-brief", (_req, res) => { calls++; res.json({ brief: "Test" }); });
  const errors: ErrorRequestHandler = (err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: "Rejected" });
  };
  app.use(errors);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const request = (token?: string, body: unknown = { answers: {} }) => fetch(
    `http://127.0.0.1:${address.port}/api/generate-brief`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    },
  );
  try {
    assert.equal((await request()).status, 401);
    assert.equal((await request("invalid")).status, 401);
    assert.equal((await request("couple")).status, 403);
    assert.equal(calls, 0);
    const beforeOversized = verified;
    assert.equal((await request("studio", { answers: { text: "x".repeat(300_000) } })).status, 413);
    assert.equal(verified, beforeOversized, "Oversized body rejected before authentication or provider");
    assert.equal((await request("studio", { answers: "not an object" })).status, 400);
    assert.equal((await request("studio", { answers: {}, systemPrompt: "x".repeat(60_001) })).status, 400);
    assert.equal(calls, 0);
    for (let n = 0; n < 8; n++) assert.equal((await request("studio")).status, 200);
    assert.equal((await request("studio")).status, 429);
    assert.equal(calls, 8);
    await assert.rejects(() => verifyFirebaseToken("not-a-signed-token"));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
