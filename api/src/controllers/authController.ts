import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

const JWT_SECRET = process.env.JWT_SECRET as string;

export const registerUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ error: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      verificationToken,
    });

    // TODO: Queue email sending here
    console.log(`Verification token for ${email}: ${verificationToken}`);

    return res
      .status(201)
      .json({ message: "User registered. Check email to verify." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Registration failed" });
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== "string")
      return res.status(400).json({ error: "Token is required" });

    const user = await User.findOne({ verificationToken: token });
    if (!user) return res.status(400).json({ error: "Invalid token" });

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    return res.json({ message: "Email verified successfully!" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Email verification failed" });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !user.isVerified)
      return res
        .status(400)
        .json({ error: "Invalid credentials or email not verified" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.json({
      token,
      user: { name: user.name, role: user.role, email: user.email },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Login failed" });
  }
};
