import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { setupTestApp, teardownTestApp } from "./helpers/testApp.js";

let app: Awaited<ReturnType<typeof setupTestApp>>["app"];
let mongoose: Awaited<ReturnType<typeof setupTestApp>>["mongoose"];
let stopBackgroundJobs: () => void;

let employerToken: string;
let secondEmployerToken: string;
let jobseekerToken: string;

const VALID_COMPANY = {
  name: "Acme Robotics",
  description: "We build delightful robots for everyday households and small businesses.",
  industry: "Robotics",
  size: "11-50",
  website: "https://acme-robotics.example",
  location: "Remote",
};

before(async () => {
  ({ app, mongoose, stopBackgroundJobs } = await setupTestApp("job-platform-test-companies"));

  const User = (await import("../src/models/userModel.js")).default;
  const passwordHash = await bcrypt.hash("password123", 12);

  await User.create({
    name: "Company Owner",
    email: "company-owner@test.local",
    password: passwordHash,
    role: "employer",
    isVerified: true,
  });
  await User.create({
    name: "Second Employer",
    email: "company-second@test.local",
    password: passwordHash,
    role: "employer",
    isVerified: true,
  });
  await User.create({
    name: "Some Jobseeker",
    email: "company-jobseeker@test.local",
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

  employerToken = await loginAs("company-owner@test.local");
  secondEmployerToken = await loginAs("company-second@test.local");
  jobseekerToken = await loginAs("company-jobseeker@test.local");
});

after(async () => {
  await teardownTestApp(mongoose, stopBackgroundJobs);
});

test("jobseeker cannot create a company", async () => {
  const res = await request(app)
    .post("/api/companies")
    .set("Authorization", `Bearer ${jobseekerToken}`)
    .send(VALID_COMPANY);
  assert.equal(res.status, 403);
});

test("employer can create a company and gets a slug", async () => {
  const res = await request(app)
    .post("/api/companies")
    .set("Authorization", `Bearer ${employerToken}`)
    .send(VALID_COMPANY);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.name, VALID_COMPANY.name);
  assert.equal(res.body.data.slug, "acme-robotics");
  assert.equal(res.body.data.verified, false);
});

test("employer cannot create a second company", async () => {
  const res = await request(app)
    .post("/api/companies")
    .set("Authorization", `Bearer ${employerToken}`)
    .send({ ...VALID_COMPANY, name: "Another Co" });
  assert.equal(res.status, 409);
});

test("a second company with a colliding name gets a suffixed slug", async () => {
  const res = await request(app)
    .post("/api/companies")
    .set("Authorization", `Bearer ${secondEmployerToken}`)
    .send({ ...VALID_COMPANY, name: "Acme Robotics" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.slug, "acme-robotics-2");
});

test("GET /api/companies/:slug returns the company and its active jobs", async () => {
  const jobPayload = {
    title: "Robotics Engineer",
    company: "Acme Robotics",
    location: "Remote",
    type: "full-time",
    salary: { min: 1000, max: 2000, currency: "USD" },
    description: "A".repeat(25),
    skills: ["robotics"],
  };
  await request(app)
    .post("/api/jobs")
    .set("Authorization", `Bearer ${employerToken}`)
    .send(jobPayload);

  const res = await request(app).get("/api/companies/acme-robotics");
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.company.name, "Acme Robotics");
  assert.equal(res.body.data.jobs.length, 1);
});

test("jobs created by a company member are auto-tagged with companyId", async () => {
  const mine = await request(app)
    .get("/api/companies/mine")
    .set("Authorization", `Bearer ${employerToken}`);
  const companyId = mine.body.data._id as string;

  const job = await request(app)
    .get("/api/companies/acme-robotics")
    .then((res) => res.body.data.jobs[0]);

  const Job = (await import("../src/models/jobModel.js")).default;
  const stored = await Job.findById(job._id).lean();
  assert.equal(String(stored?.companyId), companyId);
});

test("a non-member cannot update someone else's company", async () => {
  const mine = await request(app)
    .get("/api/companies/mine")
    .set("Authorization", `Bearer ${employerToken}`);
  const companyId = mine.body.data._id as string;

  const res = await request(app)
    .patch(`/api/companies/${companyId}`)
    .set("Authorization", `Bearer ${secondEmployerToken}`)
    .send({ description: "Hijacked description that is definitely long enough." });
  assert.equal(res.status, 403);
});

test("a member can update the company", async () => {
  const mine = await request(app)
    .get("/api/companies/mine")
    .set("Authorization", `Bearer ${employerToken}`);
  const companyId = mine.body.data._id as string;

  const res = await request(app)
    .patch(`/api/companies/${companyId}`)
    .set("Authorization", `Bearer ${employerToken}`)
    .send({ description: "An updated description that is definitely long enough." });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.description, "An updated description that is definitely long enough.");
});

test("adding a member requires an existing, company-less employer account", async () => {
  const mine = await request(app)
    .get("/api/companies/mine")
    .set("Authorization", `Bearer ${employerToken}`);
  const companyId = mine.body.data._id as string;

  // secondEmployerToken's user already owns their own company from an earlier test.
  const conflict = await request(app)
    .post(`/api/companies/${companyId}/members`)
    .set("Authorization", `Bearer ${employerToken}`)
    .send({ email: "company-second@test.local" });
  assert.equal(conflict.status, 409);

  const notFound = await request(app)
    .post(`/api/companies/${companyId}/members`)
    .set("Authorization", `Bearer ${employerToken}`)
    .send({ email: "does-not-exist@test.local" });
  assert.equal(notFound.status, 404);
});
