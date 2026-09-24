declare module "multer-storage-cloudinary" {
  import type { Request } from "express";
  import type { StorageEngine } from "multer";

  interface CloudinaryStorageParams {
    folder?: string;
    resource_type?: string;
    allowed_formats?: string[];
    transformation?: Array<Record<string, unknown>>;
    public_id?: string;
  }

  interface CloudinaryStorageOptions {
    /** Must be the top-level `cloudinary` module (has a `.v2` property) — the library calls `this.cloudinary.v2.uploader...` internally. */
    cloudinary: unknown;
    /**
     * v2.2.1 runs this through `run-parallel`, which invokes it as
     * `(req, file, callback)` and waits for `callback` to be called — it does not
     * await a returned promise. A function that returns a promise instead of
     * calling `callback` will hang forever rather than error.
     */
    params?:
      | CloudinaryStorageParams
      | ((
          req: Request,
          file: Express.Multer.File,
          callback: (error: Error | null, params?: CloudinaryStorageParams) => void,
        ) => void);
  }

  /** v2.2.1 exports a factory function (not a class) that returns a multer StorageEngine. */
  export default function CloudinaryStorage(
    options: CloudinaryStorageOptions,
  ): StorageEngine;
}
