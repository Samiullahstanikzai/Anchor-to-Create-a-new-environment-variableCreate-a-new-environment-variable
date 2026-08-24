import "./testEnv.js";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import handler from "../api/index.js";

// This confirms the Vercel serverless entry point (`api/index.js`) wraps
// the same request logic the standalone server uses, by running it behind
// a real `node:http` server and hitting it exactly like `test/server.test.js`
// does. It does NOT verify Vercel-specific behavior (static file routing
// precedence, `includeFiles` bundling, cold-start `/tmp` persistence) —
// that can only be confirmed against a real Vercel deployment.
let server;
let baseUrl;

before(async () => {
  server = createServer((req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("Vercel handler wrapper", () => {
  test("routes a simple GET through to the same app logic", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  test("still enforces auth on protected routes", async () => {
    const res = await fetch(`${baseUrl}/api/dashboard`);
    assert.equal(res.status, 401);
  });

  test("404s on an unknown path", async () => {
    const res = await fetch(`${baseUrl}/this-route-does-not-exist`);
    assert.equal(res.status, 404);
  });
});
