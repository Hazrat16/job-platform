// Import the library implementation directly — the package `index.js` runs a debug
// `readFileSync` when `!module.parent`, which can crash the API under ESM/tsx.
import pdfParse from "pdf-parse/lib/pdf-parse.js";

const MAX_BYTES = 5 * 1024 * 1024;

export async function extractResumeTextFromUpload(
  buffer: Buffer,
  mimetype: string,
  originalname: string,
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  if (buffer.length > MAX_BYTES) {
    return { ok: false, message: "File must be 5MB or smaller" };
  }

  const name = (originalname || "").toLowerCase();
  if (mimetype === "text/plain" || name.endsWith(".txt")) {
    try {
      const text = buffer.toString("utf8").trim();
      if (!text) {
        return { ok: false, message: "Text file is empty" };
      }
      return { ok: true, text };
    } catch {
      return { ok: false, message: "Could not read text file" };
    }
  }

  if (mimetype === "application/pdf" || name.endsWith(".pdf")) {
    try {
      const parsed = await pdfParse(buffer);
      const text = (parsed.text || "").trim();
      if (!text) {
        return {
          ok: false,
          message:
            "Could not extract text from PDF (it may be image-only). Paste your CV text instead.",
        };
      }
      return { ok: true, text };
    } catch {
      return { ok: false, message: "Failed to parse PDF" };
    }
  }

  return {
    ok: false,
    message: "Unsupported file type. Upload a .pdf or .txt file, or paste your CV as text.",
  };
}
