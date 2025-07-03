import dotenv from "dotenv";
import { Resend } from "resend";
dotenv.config(); // ensure .env is loaded if it wasn't already

const resend = new Resend(process.env.RESEND_API_KEY); // ✅ pass key directly

export const sendVerificationEmail = async (to: string, token: string) => {
  const link = `http://localhost:5000/api/auth/verify-email?token=${token}`;
  try {
    const { data, error } = await resend.emails.send({
      from: "Job Platform <onboarding@resend.dev>",
      to,
      subject: "Verify your email",
      html: `<p>Please verify your email by clicking <a href="${link}">this link</a></p>`,
    });

    if (error) {
      console.error("Error sending email:", error);
      return false;
    }

    console.log("Verification email sent", data);
    return true;
  } catch (err) {
    console.error("Failed to send email", err);
    return false;
  }
};
