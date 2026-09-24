import { Request, Response } from "express";
import * as companyService from "../services/companyService.js";
import type { AuthUser } from "../services/jobService.js";
import { ok } from "../utils/http.js";

export const createCompany = async (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  const company = await companyService.createCompany(
    user,
    req.body as companyService.CreateCompanyInput,
  );
  return ok(res, company, "Company created successfully", 201);
};

export const getCompany = async (req: Request, res: Response) => {
  const result = await companyService.getCompanyByIdOrSlug(req.params["idOrSlug"]);
  return ok(res, result, "Company fetched successfully");
};

export const getMyCompany = async (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  const company = await companyService.getMyCompany(user);
  return ok(res, company, "Company fetched successfully");
};

export const updateCompany = async (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  const company = await companyService.updateCompany(
    user,
    req.params["id"],
    req.body as Record<string, unknown>,
  );
  return ok(res, company, "Company updated successfully");
};

export const addCompanyMember = async (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  const { email } = req.body as { email: string };
  const company = await companyService.addCompanyMember(user, req.params["id"], email);
  return ok(res, company, "Member added successfully");
};
