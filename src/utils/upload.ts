/**
 * multer-storage-cloudinary@2.2.1 merges the raw Cloudinary API response onto
 * `req.file` — that response has `url`/`secure_url`, never a `path` (unlike disk
 * storage engines, which is what most call sites were written against). Read
 * through this helper instead of `file.path` directly.
 */
export function getUploadedFileUrl(file: Express.Multer.File | undefined | null): string | undefined {
  if (!file) return undefined;
  const f = file as Express.Multer.File & { url?: string; secure_url?: string };
  return f.path || f.secure_url || f.url || undefined;
}
