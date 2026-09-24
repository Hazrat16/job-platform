import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { setupTestApp, teardownTestApp } from "./helpers/testApp.js";

let app: Awaited<ReturnType<typeof setupTestApp>>["app"];
let mongoose: Awaited<ReturnType<typeof setupTestApp>>["mongoose"];
let stopBackgroundJobs: () => void;

let tokenA: string;
let tokenB: string;
let userAId: string;
let userBId: string;

before(async () => {
  ({ app, mongoose, stopBackgroundJobs } = await setupTestApp("job-platform-test-chat"));

  const User = (await import("../src/models/userModel.js")).default;
  const passwordHash = await bcrypt.hash("password123", 12);

  const userA = await User.create({
    name: "Chat Alice",
    email: "chat-alice@test.local",
    password: passwordHash,
    role: "jobseeker",
    isVerified: true,
  });
  const userB = await User.create({
    name: "Chat Bob",
    email: "chat-bob@test.local",
    password: passwordHash,
    role: "employer",
    isVerified: true,
  });
  userAId = String(userA._id);
  userBId = String(userB._id);

  const loginAs = async (email: string) => {
    const res = await request(app).post("/api/auth/login").send({ email, password: "password123" });
    assert.equal(res.status, 200, `login failed for ${email}`);
    return res.body.data.token as string;
  };

  tokenA = await loginAs("chat-alice@test.local");
  tokenB = await loginAs("chat-bob@test.local");
});

after(async () => {
  await teardownTestApp(mongoose, stopBackgroundJobs);
});

test("GET /api/chat/conversations is empty for a user with no conversations", async () => {
  const res = await request(app)
    .get("/api/chat/conversations")
    .set("Authorization", `Bearer ${tokenA}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.data.conversations, []);
});

test("GET /api/chat/conversation/:userId auto-creates a conversation with no messages", async () => {
  const res = await request(app)
    .get(`/api/chat/conversation/${userBId}`)
    .set("Authorization", `Bearer ${tokenA}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.data.conversation.id);
  assert.deepEqual(res.body.data.messages, []);
});

test("GET /api/chat/online-users degrades gracefully with no live WebSocket connections", async () => {
  // This test hits the app via plain HTTP (supertest), so no WebSocketService is
  // registered — this exercises the registry's null-safe fallback, not a live
  // connection. See src/chat/websocketRegistry.ts.
  const res = await request(app)
    .get("/api/chat/online-users")
    .set("Authorization", `Bearer ${tokenA}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.onlineUsers, []);
});

test("GET /api/chat/search rejects a missing query", async () => {
  const res = await request(app)
    .get("/api/chat/search")
    .set("Authorization", `Bearer ${tokenA}`);
  assert.equal(res.status, 400);
});

test("search treats regex metacharacters as literal text, not a pattern (ReDoS/injection fix)", async () => {
  const ChatMessage = (await import("../src/models/chatModel.js")).default;
  await ChatMessage.create({
    senderId: userAId,
    receiverId: userBId,
    message: "Hello without parens",
    messageType: "text",
  });

  // Before the fix, a regex like "Hello (without)? parens" would match via the
  // capturing group even though the stored text has no literal parentheses —
  // the group merely made "without" optional, not require literal "()" chars.
  const falsePositive = await request(app)
    .get("/api/chat/search")
    .query({ query: "Hello (without)? parens" })
    .set("Authorization", `Bearer ${tokenA}`);
  assert.equal(falsePositive.status, 200);
  assert.equal(
    falsePositive.body.data.messages.length,
    0,
    "escaped search must not match via regex semantics — parens/? must be literal",
  );

  const literalMatch = await request(app)
    .get("/api/chat/search")
    .query({ query: "without parens" })
    .set("Authorization", `Bearer ${tokenA}`);
  assert.equal(literalMatch.status, 200);
  assert.equal(literalMatch.body.data.messages.length, 1);
});

test("a user cannot delete or edit another user's message", async () => {
  const ChatMessage = (await import("../src/models/chatModel.js")).default;
  const message = await ChatMessage.create({
    senderId: userAId,
    receiverId: userBId,
    message: "Alice's message",
    messageType: "text",
  });

  const deleteAsB = await request(app)
    .delete(`/api/chat/message/${message._id}`)
    .set("Authorization", `Bearer ${tokenB}`);
  assert.equal(deleteAsB.status, 403);

  const editAsB = await request(app)
    .put(`/api/chat/message/${message._id}`)
    .set("Authorization", `Bearer ${tokenB}`)
    .send({ newMessage: "hijacked" });
  assert.equal(editAsB.status, 403);
});

test("a user can edit and delete their own message", async () => {
  const ChatMessage = (await import("../src/models/chatModel.js")).default;
  const message = await ChatMessage.create({
    senderId: userAId,
    receiverId: userBId,
    message: "Original text",
    messageType: "text",
  });

  const edit = await request(app)
    .put(`/api/chat/message/${message._id}`)
    .set("Authorization", `Bearer ${tokenA}`)
    .send({ newMessage: "Edited text" });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  assert.equal(edit.body.data.editedMessage.message, "Edited text");
  assert.equal(edit.body.data.editedMessage.isEdited, true);

  const del = await request(app)
    .delete(`/api/chat/message/${message._id}`)
    .set("Authorization", `Bearer ${tokenA}`);
  assert.equal(del.status, 200);

  const reloaded = await ChatMessage.findById(message._id);
  assert.equal(reloaded?.isDeleted, true);
});
