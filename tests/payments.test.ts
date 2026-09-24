import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { setupTestApp, teardownTestApp } from "./helpers/testApp.js";

let app: Awaited<ReturnType<typeof setupTestApp>>["app"];
let mongoose: Awaited<ReturnType<typeof setupTestApp>>["mongoose"];
let stopBackgroundJobs: () => void;

let employerToken: string;
let otherEmployerToken: string;
let jobseekerToken: string;
let jobId: string;

before(async () => {
  ({ app, mongoose, stopBackgroundJobs } = await setupTestApp("job-platform-test-payments"));

  const User = (await import("../src/models/userModel.js")).default;
  const passwordHash = await bcrypt.hash("password123", 12);

  await User.create({
    name: "Payments Employer",
    email: "pay-employer@test.local",
    password: passwordHash,
    role: "employer",
    isVerified: true,
  });
  await User.create({
    name: "Other Employer",
    email: "pay-other-employer@test.local",
    password: passwordHash,
    role: "employer",
    isVerified: true,
  });
  await User.create({
    name: "Jobseeker",
    email: "pay-jobseeker@test.local",
    password: passwordHash,
    role: "jobseeker",
    isVerified: true,
  });

  const loginAs = async (email: string) => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "password123" });
    assert.equal(res.status, 200, `login failed for ${email}`);
    return res.body.data.token as string;
  };

  employerToken = await loginAs("pay-employer@test.local");
  otherEmployerToken = await loginAs("pay-other-employer@test.local");
  jobseekerToken = await loginAs("pay-jobseeker@test.local");

  const job = await request(app)
    .post("/api/jobs")
    .set("Authorization", `Bearer ${employerToken}`)
    .send({
      title: "Featured Candidate Role",
      company: "PayCo",
      location: "Remote",
      type: "full-time",
      salary: { min: 1000, max: 2000, currency: "USD" },
      description: "A".repeat(25),
      skills: ["testing"],
    });
  jobId = job.body.data._id;
});

after(async () => {
  await teardownTestApp(mongoose, stopBackgroundJobs);
});

// These tests only exercise validation branches that return *before* the real
// SSLCommerz sandbox network call, keeping the suite hermetic (see auth.test.ts /
// applications.test.ts for the same pattern with other third-party APIs).

test("jobseeker cannot initiate any payment", async () => {
  const res = await request(app)
    .post("/api/payments/sslcommerz/init")
    .set("Authorization", `Bearer ${jobseekerToken}`)
    .send({ purpose: "job_boost", jobId, boostDays: 3 });
  assert.equal(res.status, 403);
});

test("job boost rejects an invalid jobId", async () => {
  const res = await request(app)
    .post("/api/payments/sslcommerz/init")
    .set("Authorization", `Bearer ${employerToken}`)
    .send({ purpose: "job_boost", jobId: "not-an-object-id", boostDays: 3 });
  assert.equal(res.status, 400);
});

test("job boost rejects boostDays out of range", async () => {
  const res = await request(app)
    .post("/api/payments/sslcommerz/init")
    .set("Authorization", `Bearer ${employerToken}`)
    .send({ purpose: "job_boost", jobId, boostDays: 999 });
  assert.equal(res.status, 400);
});

test("job boost rejects a job the requester doesn't own", async () => {
  const res = await request(app)
    .post("/api/payments/sslcommerz/init")
    .set("Authorization", `Bearer ${otherEmployerToken}`)
    .send({ purpose: "job_boost", jobId, boostDays: 3 });
  assert.equal(res.status, 403);
});

test("job boost rejects a non-existent job", async () => {
  const res = await request(app)
    .post("/api/payments/sslcommerz/init")
    .set("Authorization", `Bearer ${employerToken}`)
    .send({ purpose: "job_boost", jobId: "000000000000000000000000", boostDays: 3 });
  assert.equal(res.status, 404);
});

test("a featured (boosted) job is sorted ahead of newer non-featured jobs", async () => {
  const Job = (await import("../src/models/jobModel.js")).default;

  // Simulates what a completed job_boost payment applies (see applyJobBoost in
  // paymentController.ts) without going through the real payment gateway.
  await Job.updateOne(
    { _id: jobId },
    { $set: { featuredUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) } },
  );

  const newerJob = await request(app)
    .post("/api/jobs")
    .set("Authorization", `Bearer ${otherEmployerToken}`)
    .send({
      title: "Newer Non-Featured Role",
      company: "OtherCo",
      location: "Remote",
      type: "full-time",
      salary: { min: 1000, max: 2000, currency: "USD" },
      description: "B".repeat(25),
      skills: ["testing"],
    });
  assert.equal(newerJob.status, 201);

  const list = await request(app).get("/api/jobs?sort=recent");
  assert.equal(list.status, 200);
  assert.equal(list.body.data[0]._id, jobId, "the featured job should be sorted first");
});
