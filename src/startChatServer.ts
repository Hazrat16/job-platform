import dotenv from "dotenv";
dotenv.config();

// Deferred via dynamic import: static imports are hoisted and evaluated before
// this file's own top-level code runs, which would read process.env in other
// modules (Redis config, CORS origins, etc.) before dotenv.config() above has
// populated it. A dynamic import only resolves once execution actually reaches
// it, so this guarantees env vars are loaded first for the entire app.
const { startServer } = await import("./bootstrap.js");
await startServer();
