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
    cloudinary: unknown;
    params?:
      | CloudinaryStorageParams
      | ((
          req: Request,
          file: Express.Multer.File,
        ) => Promise<CloudinaryStorageParams> | CloudinaryStorageParams);
  }

  /** v2.2.1 exports a factory function (not a class) that returns a multer StorageEngine. */
  export default function CloudinaryStorage(
    options: CloudinaryStorageOptions,
  ): StorageEngine;
}
