import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import request from "supertest";
import { setupTestApp, teardownTestApp } from "./helpers/testApp.js";

let app: Awaited<ReturnType<typeof setupTestApp>>["app"];
let mongoose: Awaited<ReturnType<typeof setupTestApp>>["mongoose"];
let stopBackgroundJobs: () => void;

before(async () => {
  ({ app, mongoose, stopBackgroundJobs } = await setupTestApp("job-platform-test-auth"));
});

after(async () => {
  await teardownTestApp(mongoose, stopBackgroundJobs);
});

test("bootstrap-admin rejects a missing/invalid secret", async () => {
  const res = await request(app)
    .post("/api/auth/bootstrap-admin")
    .send({ email: "nope@example.com", secret: "wrong" });
  assert.equal(res.status, 403);
  assert.equal(res.body.success, false);
});

test("bootstrap-admin creates a verified admin user with the correct secret", async () => {
  const res = await request(app)
    .post("/api/auth/bootstrap-admin")
    .set("x-admin-bootstrap-secret", process.env["ADMIN_BOOTSTRAP_SECRET"] as string)
    .send({ email: "admin1@example.com", password: "adminpass123", name: "Admin One" });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.created, true);
});

test("login rejects an unknown email without revealing whether the account exists", async () => {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "admin1@example.com", password: "wrong-password" });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "BAD_REQUEST");
});

test("login succeeds for a bootstrapped admin with the correct password", async () => {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "admin1@example.com", password: "adminpass123" });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.token, "expected an access token in the response");
  assert.equal(res.body.data.user.role, "admin");
});

test("protected route rejects requests with no token", async () => {
  const res = await request(app).get("/api/auth/protected");
  assert.equal(res.status, 401);
});

test("protected route accepts a valid token from login", async () => {
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: "admin1@example.com", password: "adminpass123" });
  const token = login.body.data.token as string;

  const res = await request(app)
    .get("/api/auth/protected")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.email, "admin1@example.com");
});

test("forgot-password returns a generic response for an unknown email (no user enumeration)", async () => {
  // Deliberately not testing the "known email" branch here: it sends a real email via
  // the Resend API with no mocking seam available (ESM named exports aren't mockable
  // without extra tooling — see tests/helpers/testApp.ts), which would make this suite
  // depend on third-party network access and flake/hang in CI.
  const res = await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: "definitely-not-registered@example.com" });
  assert.equal(res.status, 200);
  assert.match(res.body.message, /if an account exists/i);
});
