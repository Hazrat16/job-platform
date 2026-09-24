import { closeRedis } from "../../src/config/redis.js";

/**
 * Integration test harness. Requires a real, disposable MongoDB reachable at
 * TEST_MONGODB_URI (defaults to a local instance) — start one with:
 *   docker run -d -p 27099:27017 mongo:7.0
 *
 * Env vars are set here, before any dynamic import of app code, since ESM
 * import hoisting would otherwise let other modules read process.env before
 * this file's assignments run (see src/config/redis.ts for the same issue).
 */
process.env["NODE_ENV"] = "test";
process.env["JWT_SECRET"] ||= "test-only-jwt-secret-do-not-use-in-prod";
process.env["ADMIN_BOOTSTRAP_SECRET"] ||= "test-only-bootstrap-secret";
process.env["MONGODB_URI"] ||=
  process.env["TEST_MONGODB_URI"] || "mongodb://127.0.0.1:27099/job-platform-test";

export async function setupTestApp(dbName: string) {
  const mongoose = (await import("mongoose")).default;
  const uri = (process.env["MONGODB_URI"] as string).replace(
    /\/[^/?]+(\?|$)/,
    `/${dbName}$1`,
  );
  await mongoose.connect(uri);

  const appModule = await import("../../src/app.js");

  // Deleted *after* importing app code: other modules (config/cloudinary.ts,
  // utils/email.ts) call the bare dotenv.config() as a side effect of that import,
  // which would otherwise re-populate these from the developer's real .env, since
  // dotenv fills in only currently-unset vars. Tests must never attempt a real
  // Redis/RabbitMQ connection — both fall back to in-process behavior when unset.
  delete process.env["REDIS_URL"];
  delete process.env["RABBITMQ_URL"];

  return { app: appModule.default, stopBackgroundJobs: appModule.stopBackgroundJobs, mongoose };
}

export async function teardownTestApp(
  mongoose: Awaited<ReturnType<typeof setupTestApp>>["mongoose"],
  stopBackgroundJobs: () => void,
) {
  stopBackgroundJobs();
  await closeRedis();
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
}
