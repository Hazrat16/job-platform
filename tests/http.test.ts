import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../src/utils/http.js";

test("HttpError stores status, code, details", () => {
  const err = new HttpError(403, "FORBIDDEN", "Access denied", { role: "jobseeker" });
  assert.equal(err.status, 403);
  assert.equal(err.code, "FORBIDDEN");
  assert.equal(err.message, "Access denied");
  assert.deepEqual(err.details, { role: "jobseeker" });
});
