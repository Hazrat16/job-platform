import { NextFunction, Request, Response } from "express";
import { fail } from "../utils/http.js";

type Role = "jobseeker" | "employer" | "admin";

export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as { id?: string; role?: string } | undefined;
    if (!user?.id) {
      fail(res, 401, "UNAUTHORIZED", "Unauthorized");
      return;
    }
    if (!user.role || !allowedRoles.includes(user.role as Role)) {
      fail(res, 403, "FORBIDDEN", "You do not have access to this resource");
      return;
    }
    next();
  };
}
