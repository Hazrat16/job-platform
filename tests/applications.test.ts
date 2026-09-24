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
let activeJobId: string;
let draftJobId: string;

before(async () => {
  ({ app, mongoose, stopBackgroundJobs } = await setupTestApp(
    "job-platform-test-applications",
  ));

  const User = (await import("../src/models/userModel.js")).default;
  const passwordHash = await bcrypt.hash("password123", 12);

  await User.create({
    name: "Employer",
    email: "app-employer@test.local",
    password: passwordHash,
    role: "employer",
    isVerified: true,
  });
  await User.create({
    name: "Other Employer",
    email: "app-other-employer@test.local",
    password: passwordHash,
    role: "employer",
    isVerified: true,
  });
  await User.create({
    name: "Jobseeker",
    email: "app-jobseeker@test.local",
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

  employerToken = await loginAs("app-employer@test.local");
  otherEmployerToken = await loginAs("app-other-employer@test.local");
  jobseekerToken = await loginAs("app-jobseeker@test.local");

  const jobPayload = {
    title: "QA Engineer",
    company: "Acme",
    location: "Remote",
    type: "full-time",
    salary: { min: 1000, max: 2000, currency: "USD" },
    description: "A".repeat(25),
    skills: ["testing"],
  };

  const activeJob = await request(app)
    .post("/api/jobs")
    .set("Authorization", `Bearer ${employerToken}`)
    .send(jobPayload);
  activeJobId = activeJob.body.data._id;

  const draftJob = await request(app)
    .post("/api/jobs")
    .set("Authorization", `Bearer ${employerToken}`)
    .send({ ...jobPayload, title: "Draft Role" });
  draftJobId = draftJob.body.data._id;
  await request(app)
    .patch(`/api/jobs/${draftJobId}/status`)
    .set("Authorization", `Bearer ${employerToken}`)
    .send({ status: "draft" });
});

after(async () => {
  await teardownTestApp(mongoose, stopBackgroundJobs);
});

// Sent as a plain multipart text field (not `.attach()`-ed as a file): the apply
// route's upload middleware stores files via Cloudinary, which would mean a real
// third-party network call in tests. The controller already falls back to
// `req.body.resume` when no file is present, so this exercises the same code path
// without that dependency.
test("jobseeker can apply to an active job", async () => {
  const res = await request(app)
    .post(`/api/jobs/${activeJobId}/apply`)
    .set("Authorization", `Bearer ${jobseekerToken}`)
    .field("resume", "https://example.com/resume.pdf");
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.status, "pending");
});

test("applying twice for the same job is rejected as a conflict", async () => {
  const res = await request(app)
    .post(`/api/jobs/${activeJobId}/apply`)
    .set("Authorization", `Bearer ${jobseekerToken}`)
    .field("resume", "https://example.com/resume.pdf");
  assert.equal(res.status, 409);
});

test("cannot apply to a non-active (draft) job", async () => {
  const res = await request(app)
    .post(`/api/jobs/${draftJobId}/apply`)
    .set("Authorization", `Bearer ${jobseekerToken}`)
    .field("resume", "https://example.com/resume.pdf");
  assert.equal(res.status, 404);
});

test("employer cannot view applications for a job they don't own", async () => {
  const res = await request(app)
    .get(`/api/jobs/${activeJobId}/applications`)
    .set("Authorization", `Bearer ${otherEmployerToken}`);
  assert.equal(res.status, 403);
});

test("job owner can view applications for their job", async () => {
  const res = await request(app)
    .get(`/api/jobs/${activeJobId}/applications`)
    .set("Authorization", `Bearer ${employerToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
});

test("jobseeker can see their own applications", async () => {
  const res = await request(app)
    .get("/api/applications")
    .set("Authorization", `Bearer ${jobseekerToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
});

test("employer can update application status, jobseeker cannot", async () => {
  const list = await request(app)
    .get(`/api/jobs/${activeJobId}/applications`)
    .set("Authorization", `Bearer ${employerToken}`);
  const applicationId = list.body.data[0]._id as string;

  const forbidden = await request(app)
    .patch(`/api/applications/${applicationId}`)
    .set("Authorization", `Bearer ${jobseekerToken}`)
    .send({ status: "shortlisted" });
  assert.equal(forbidden.status, 403);

  const res = await request(app)
    .patch(`/api/applications/${applicationId}`)
    .set("Authorization", `Bearer ${employerToken}`)
    .send({ status: "shortlisted" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.status, "shortlisted");
});
