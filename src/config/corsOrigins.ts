/** Shared allowlist source for both the Express CORS middleware and the Socket.IO server. */
export function getAllowedOrigins(): string[] {
  const raw =
    process.env["CORS_ALLOWED_ORIGINS"] ||
    process.env["FRONTEND_URL"] ||
    "http://localhost:3000";
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
