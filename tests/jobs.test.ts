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

const VALID_JOB = {
  title: "Backend Engineer",
  company: "Acme Corp",
  location: "Remote",
  type: "full-time",
  salary: { min: 1000, max: 2000, currency: "USD" },
  description: "A" + "b".repeat(25), // satisfies the >=20 char validator
  skills: ["node", "typescript"],
};

before(async () => {
  ({ app, mongoose, stopBackgroundJobs } = await setupTestApp("job-platform-test-jobs"));

  const User = (await import("../src/models/userModel.js")).default;
  const passwordHash = await bcrypt.hash("password123", 12);

  await User.create({
    name: "Employer One",
    email: "employer1@test.local",
    password: passwordHash,
    role: "employer",
    isVerified: true,
  });
  await User.create({
    name: "Employer Two",
    email: "employer2@test.local",
    password: passwordHash,
    role: "employer",
    isVerified: true,
  });
  await User.create({
    name: "Jobseeker One",
    email: "jobseeker1@test.local",
    password: passwordHash,
    role: "jobseeker",
    isVerified: true,
  });

  const loginAs = async (email: string) => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "password123" });
    assert.equal(res.status, 200, `login failed for ${email}: ${JSON.stringify(res.body)}`);
    return res.body.data.token as string;
  };

  employerToken = await loginAs("employer1@test.local");
  otherEmployerToken = await loginAs("employer2@test.local");
  jobseekerToken = await loginAs("jobseeker1@test.local");
});

after(async () => {
  await teardownTestApp(mongoose, stopBackgroundJobs);
});

test("jobseeker cannot create a job", async () => {
  const res = await request(app)
    .post("/api/jobs")
    .set("Authorization", `Bearer ${jobseekerToken}`)
    .send(VALID_JOB);
  assert.equal(res.status, 403);
});

test("employer can create a job with valid data", async () => {
  const res = await request(app)
    .post("/api/jobs")
    .set("Authorization", `Bearer ${employerToken}`)
    .send(VALID_JOB);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.title, VALID_JOB.title);
  assert.equal(res.body.data.status, "active");
});

test("mass assignment: client-supplied status/employer/deletedAt are ignored on create", async () => {
  const res = await request(app)
    .post("/api/jobs")
    .set("Authorization", `Bearer ${employerToken}`)
    .send({
      ...VALID_JOB,
      title: "Mass Assignment Probe",
      status: "closed",
      employer: "000000000000000000000000",
      deletedAt: new Date().toISOString(),
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  // Must default to "active" (status is only settable via PATCH /:id/status) and be
  // owned by the authenticated employer, never the attacker-supplied id.
  assert.equal(res.body.data.status, "active");
  assert.notEqual(res.body.data.employer, "000000000000000000000000");
  assert.equal(res.body.data.deletedAt, undefined);
});

test("GET /api/jobs lists created jobs", async () => {
  const res = await request(app).get("/api/jobs");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.ok(res.body.data.length >= 2);
});

test("GET /api/jobs/:id returns a single job", async () => {
  const created = await request(app)
    .post("/api/jobs")
    .set("Authorization", `Bearer ${employerToken}`)
    .send(VALID_JOB);
  const jobId = created.body.data._id as string;

  const res = await request(app).get(`/api/jobs/${jobId}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data._id, jobId);
});

test("a different employer cannot update someone else's job", async () => {
  const created = await request(app)
    .post("/api/jobs")
    .set("Authorization", `Bearer ${employerToken}`)
    .send(VALID_JOB);
  const jobId = created.body.data._id as string;

  const res = await request(app)
    .put(`/api/jobs/${jobId}`)
    .set("Authorization", `Bearer ${otherEmployerToken}`)
    .send({ title: "Hijacked title" });
  assert.equal(res.status, 403);
});

test("mass assignment: status/employer are ignored on update too", async () => {
  const created = await request(app)
    .post("/api/jobs")
    .set("Authorization", `Bearer ${employerToken}`)
    .send(VALID_JOB);
  const jobId = created.body.data._id as string;
  const originalEmployer = created.body.data.employer as string;

  const res = await request(app)
    .put(`/api/jobs/${jobId}`)
    .set("Authorization", `Bearer ${employerToken}`)
    .send({
      title: "Updated title",
      status: "closed",
      employer: "000000000000000000000000",
    });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.title, "Updated title");
  assert.equal(res.body.data.status, "active");
  assert.equal(res.body.data.employer, originalEmployer);
});
