import { NextFunction, Request, Response } from "express";

export const validateRegisterInput = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    res.status(400).json({ error: "All fields are required" });
    return; // prevent calling next() after response
  }

  next(); // validation passed
};
